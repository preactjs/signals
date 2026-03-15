use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use serde::Deserialize;
use swc_core::{
    common::{comments::Comments, SourceMapper, Span, Spanned, SyntaxContext, DUMMY_SP},
    ecma::{
        ast::*,
        visit::{noop_visit_mut_type, noop_visit_type, Visit, VisitMut, VisitMutWith, VisitWith},
    },
    plugin::{
        metadata::TransformPluginMetadataContextKind,
        plugin_transform,
        proxies::{PluginCommentsProxy, PluginSourceMapProxy, TransformPluginProgramMetadata},
    },
};

const DEFAULT_IMPORT_SOURCE: &str = "@preact/signals-react/runtime";
const USE_SIGNALS_IMPORT: &str = "useSignals";
const GENERATED_USE_SIGNALS_IDENT: &str = "_useSignals";
const GENERATED_EFFECT_IDENT: &str = "_effect";

const MANAGED_COMPONENT: u8 = 1;
const MANAGED_HOOK: u8 = 2;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct PluginOptions {
    mode: Option<PluginMode>,
    import_source: Option<String>,
    #[serde(rename = "detectTransformedJSX")]
    detect_transformed_jsx: Option<bool>,
    experimental: Option<ExperimentalOptions>,
}

impl PluginOptions {
    fn mode(&self) -> PluginMode {
        self.mode.unwrap_or(PluginMode::Auto)
    }

    fn import_source(&self) -> &str {
        self.import_source
            .as_deref()
            .unwrap_or(DEFAULT_IMPORT_SOURCE)
    }

    fn detect_transformed_jsx(&self) -> bool {
        self.detect_transformed_jsx.unwrap_or(false)
    }

    fn debug_enabled(&self) -> bool {
        self.experimental
            .as_ref()
            .and_then(|experimental| experimental.debug)
            .unwrap_or(false)
    }

    fn no_try_finally(&self) -> bool {
        self.experimental
            .as_ref()
            .and_then(|experimental| experimental.no_try_finally)
            .unwrap_or(false)
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum PluginMode {
    #[default]
    Auto,
    Manual,
    All,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct ExperimentalOptions {
    debug: Option<bool>,
    no_try_finally: Option<bool>,
}

#[derive(Debug, Clone)]
struct FunctionInfo {
    name: Option<String>,
    should_transform: bool,
}

#[derive(Debug, Clone)]
struct SignalNameInjection {
    variable_name: String,
    line_number: usize,
}

#[derive(Debug, Default)]
struct AnalysisResult {
    functions: HashMap<u32, FunctionInfo>,
    signal_name_injections: HashMap<u32, SignalNameInjection>,
    any_transform: bool,
}

#[derive(Debug, Clone)]
struct FunctionContext {
    key: u32,
    name: Option<String>,
    contains_jsx: bool,
    maybe_uses_signal: bool,
    opted_in: bool,
    opted_out: bool,
    is_custom_hook_callback: bool,
}

#[derive(Debug, Clone)]
struct Ancestor {
    kind: AncestorKind,
    span: Span,
}

#[derive(Debug, Clone)]
enum AncestorKind {
    VariableDeclaration,
    VariableDeclarator { name: Option<String> },
    AssignmentExpression { name: Option<String> },
    CallExpression { callee_ident: Option<String> },
    ObjectExpression,
    ObjectProperty { name: Option<String> },
    ExportDefaultDeclaration,
    ExportNamedDeclaration,
    ExpressionStatement,
}

#[derive(Debug, Clone, Copy)]
enum CommentMarker {
    OptIn,
    OptOut,
}

#[derive(Debug, Default)]
struct JsxImportState {
    identifiers: HashSet<String>,
    objects: HashMap<String, Vec<String>>,
}

impl JsxImportState {
    fn add_identifier(&mut self, local_name: String) {
        self.identifiers.insert(local_name);
    }

    fn add_object(&mut self, local_name: String, methods: &[&str]) {
        self.objects.insert(
            local_name,
            methods.iter().map(|method| (*method).to_owned()).collect(),
        );
    }
}

struct JsxImportCollector {
    state: JsxImportState,
}

impl JsxImportCollector {
    fn new() -> Self {
        Self {
            state: JsxImportState::default(),
        }
    }
}

impl Visit for JsxImportCollector {
    noop_visit_type!();

    fn visit_import_decl(&mut self, import_decl: &ImportDecl) {
        let source = import_decl.src.value.to_string_lossy();
        let Some(methods) = jsx_package_methods(&source) else {
            return;
        };

        for specifier in &import_decl.specifiers {
            match specifier {
                ImportSpecifier::Named(named) => {
                    let imported_name = named
                        .imported
                        .as_ref()
                        .map(module_export_name_to_string)
                        .unwrap_or_else(|| named.local.sym.to_string());
                    if methods.iter().any(|method| *method == imported_name) {
                        self.state.add_identifier(named.local.sym.to_string());
                    }
                }
                ImportSpecifier::Default(default) => {
                    self.state
                        .add_object(default.local.sym.to_string(), methods);
                }
                ImportSpecifier::Namespace(namespace) => {
                    self.state
                        .add_object(namespace.local.sym.to_string(), methods);
                }
                _ => {}
            }
        }
    }

    fn visit_var_declarator(&mut self, var_declarator: &VarDeclarator) {
        let Some(init) = &var_declarator.init else {
            return;
        };

        let Some(source) = require_source_from_expr(init.as_ref()) else {
            return;
        };

        let Some(methods) = jsx_package_methods(&source) else {
            return;
        };

        match &var_declarator.name {
            Pat::Ident(binding_ident) => {
                self.state
                    .add_object(binding_ident.id.sym.to_string(), methods);
            }
            Pat::Object(object_pat) => {
                for property in &object_pat.props {
                    if let ObjectPatProp::KeyValue(key_value_prop) = property {
                        let Some(imported_name) = prop_name_to_static_name(&key_value_prop.key)
                        else {
                            continue;
                        };

                        if !methods.iter().any(|method| *method == imported_name) {
                            continue;
                        }

                        if let Pat::Ident(binding_ident) = key_value_prop.value.as_ref() {
                            self.state.add_identifier(binding_ident.id.sym.to_string());
                        }
                    }

                    if let ObjectPatProp::Assign(assign_pat_prop) = property {
                        let local_name = assign_pat_prop.key.id.sym.to_string();
                        if methods.iter().any(|method| *method == local_name) {
                            self.state.add_identifier(local_name);
                        }
                    }
                }
            }
            _ => {}
        }
    }
}

struct Analyzer {
    options: PluginOptions,
    file_name: Option<String>,
    source_map: Arc<PluginSourceMapProxy>,
    comments: Option<PluginCommentsProxy>,
    jsx_imports: JsxImportState,
    ancestors: Vec<Ancestor>,
    functions: Vec<FunctionContext>,
    current_var_name: Option<String>,
    analysis: AnalysisResult,
}

impl Analyzer {
    fn new(
        options: PluginOptions,
        file_name: Option<String>,
        source_map: Arc<PluginSourceMapProxy>,
        comments: Option<PluginCommentsProxy>,
        jsx_imports: JsxImportState,
    ) -> Self {
        Self {
            options,
            file_name,
            source_map,
            comments,
            jsx_imports,
            ancestors: Vec::new(),
            functions: Vec::new(),
            current_var_name: None,
            analysis: AnalysisResult::default(),
        }
    }

    fn push_ancestor(&mut self, kind: AncestorKind, span: Span) {
        self.ancestors.push(Ancestor { kind, span });
    }

    fn pop_ancestor(&mut self) {
        self.ancestors.pop();
    }

    fn push_function(&mut self, span: Span, name: Option<String>) {
        let function_context = FunctionContext {
            key: span.lo.0,
            name,
            contains_jsx: false,
            maybe_uses_signal: false,
            opted_in: self.has_comment_marker(span, CommentMarker::OptIn),
            opted_out: self.has_comment_marker(span, CommentMarker::OptOut),
            is_custom_hook_callback: self
                .ancestors
                .last()
                .and_then(|ancestor| match &ancestor.kind {
                    AncestorKind::CallExpression { callee_ident } => callee_ident.as_deref(),
                    _ => None,
                })
                .map(is_custom_hook_name)
                .unwrap_or(false),
        };

        self.functions.push(function_context);
    }

    fn pop_function(&mut self) {
        let Some(function_context) = self.functions.pop() else {
            return;
        };

        let should_transform = should_transform(&self.options, &function_context);
        if should_transform {
            self.analysis.any_transform = true;
        }

        self.analysis.functions.insert(
            function_context.key,
            FunctionInfo {
                name: function_context.name,
                should_transform,
            },
        );
    }

    fn resolve_name_from_ancestors(&self) -> Option<String> {
        for ancestor in self.ancestors.iter().rev() {
            match &ancestor.kind {
                AncestorKind::VariableDeclarator { name }
                | AncestorKind::AssignmentExpression { name }
                | AncestorKind::ObjectProperty { name } => {
                    if let Some(name) = name {
                        return Some(name.clone());
                    }
                }
                AncestorKind::ExportDefaultDeclaration => {
                    return self.file_name.clone();
                }
                AncestorKind::CallExpression { .. } => {}
                _ => return None,
            }
        }

        None
    }

    fn mark_parent_component_or_hook(&mut self, jsx: bool, signal: bool) {
        for function_context in self.functions.iter_mut().rev() {
            if function_context.is_custom_hook_callback {
                return;
            }

            let is_component_or_hook = function_context
                .name
                .as_deref()
                .map(|name| is_component_name(name) || is_custom_hook_name(name))
                .unwrap_or(false);

            if is_component_or_hook {
                if jsx {
                    function_context.contains_jsx = true;
                }

                if signal {
                    function_context.maybe_uses_signal = true;
                }

                return;
            }
        }
    }

    fn has_comment_marker(&self, span: Span, marker: CommentMarker) -> bool {
        if has_leading_comment(self.comments, span.lo, marker) {
            return true;
        }

        for ancestor in self.ancestors.iter().rev() {
            match ancestor.kind {
                AncestorKind::VariableDeclaration
                | AncestorKind::VariableDeclarator { .. }
                | AncestorKind::AssignmentExpression { .. }
                | AncestorKind::CallExpression { .. }
                | AncestorKind::ObjectExpression => {
                    if has_leading_comment(self.comments, ancestor.span.lo, marker) {
                        return true;
                    }
                }
                AncestorKind::ExportDefaultDeclaration
                | AncestorKind::ExportNamedDeclaration
                | AncestorKind::ObjectProperty { .. }
                | AncestorKind::ExpressionStatement => {
                    return has_leading_comment(self.comments, ancestor.span.lo, marker);
                }
            }
        }

        false
    }

    fn maybe_record_signal_name_injection(&mut self, call_expr: &CallExpr) {
        if !self.options.debug_enabled() {
            return;
        }

        let Some(variable_name) = self.current_var_name.as_deref() else {
            return;
        };

        if !is_signal_call(call_expr) || has_name_in_options(call_expr) {
            return;
        }

        let line_number = self.source_map.lookup_char_pos(call_expr.span.lo).line;
        self.analysis.signal_name_injections.insert(
            call_expr.span.lo.0,
            SignalNameInjection {
                variable_name: variable_name.to_owned(),
                line_number,
            },
        );
    }
}

impl Visit for Analyzer {
    noop_visit_type!();

    fn visit_fn_decl(&mut self, fn_decl: &FnDecl) {
        self.push_function(fn_decl.function.span, Some(fn_decl.ident.sym.to_string()));
        fn_decl.function.visit_with(self);
        self.pop_function();
    }

    fn visit_fn_expr(&mut self, fn_expr: &FnExpr) {
        let name = fn_expr
            .ident
            .as_ref()
            .map(|ident| ident.sym.to_string())
            .or_else(|| self.resolve_name_from_ancestors());
        self.push_function(fn_expr.function.span, name);
        fn_expr.function.visit_with(self);
        self.pop_function();
    }

    fn visit_arrow_expr(&mut self, arrow_expr: &ArrowExpr) {
        let name = self.resolve_name_from_ancestors();
        self.push_function(arrow_expr.span, name);
        arrow_expr.params.visit_with(self);
        arrow_expr.body.visit_with(self);
        self.pop_function();
    }

    fn visit_method_prop(&mut self, method_prop: &MethodProp) {
        let name = prop_name_to_static_name(&method_prop.key).map(str::to_owned);
        self.push_function(method_prop.function.span, name);
        method_prop.function.visit_with(self);
        self.pop_function();
    }

    fn visit_var_decl(&mut self, var_decl: &VarDecl) {
        self.push_ancestor(AncestorKind::VariableDeclaration, var_decl.span);
        var_decl.decls.visit_with(self);
        self.pop_ancestor();
    }

    fn visit_var_declarator(&mut self, var_declarator: &VarDeclarator) {
        let name = pat_ident_name(&var_declarator.name).map(str::to_owned);
        let previous_var_name = self.current_var_name.take();
        self.current_var_name = name.clone();

        self.push_ancestor(
            AncestorKind::VariableDeclarator { name },
            var_declarator.span,
        );

        var_declarator.name.visit_with(self);

        if let Some(init) = &var_declarator.init {
            init.visit_with(self);
        }

        self.pop_ancestor();
        self.current_var_name = previous_var_name;
    }

    fn visit_assign_expr(&mut self, assign_expr: &AssignExpr) {
        let name = assign_target_name(&assign_expr.left);
        self.push_ancestor(
            AncestorKind::AssignmentExpression { name },
            assign_expr.span,
        );
        assign_expr.right.visit_with(self);
        self.pop_ancestor();
    }

    fn visit_call_expr(&mut self, call_expr: &CallExpr) {
        self.maybe_record_signal_name_injection(call_expr);

        if self.options.detect_transformed_jsx()
            && is_jsx_alternative_call(call_expr, &self.jsx_imports)
        {
            self.mark_parent_component_or_hook(true, false);
        }

        let callee_ident = callee_identifier_name(&call_expr.callee).map(str::to_owned);
        self.push_ancestor(
            AncestorKind::CallExpression { callee_ident },
            call_expr.span,
        );
        call_expr.callee.visit_with(self);
        call_expr.args.visit_with(self);
        self.pop_ancestor();
    }

    fn visit_object_lit(&mut self, object_lit: &ObjectLit) {
        self.push_ancestor(AncestorKind::ObjectExpression, object_lit.span);
        object_lit.props.visit_with(self);
        self.pop_ancestor();
    }

    fn visit_prop(&mut self, prop: &Prop) {
        if let Prop::KeyValue(key_value_prop) = prop {
            let name = prop_name_to_static_name(&key_value_prop.key).map(str::to_owned);
            self.push_ancestor(
                AncestorKind::ObjectProperty { name },
                key_value_prop.key.span(),
            );
            key_value_prop.value.visit_with(self);
            self.pop_ancestor();
            return;
        }

        if let Prop::Method(method_prop) = prop {
            method_prop.visit_with(self);
            return;
        }

        prop.visit_children_with(self);
    }

    fn visit_export_default_decl(&mut self, export_default_decl: &ExportDefaultDecl) {
        self.push_ancestor(
            AncestorKind::ExportDefaultDeclaration,
            export_default_decl.span,
        );
        export_default_decl.decl.visit_with(self);
        self.pop_ancestor();
    }

    fn visit_export_default_expr(&mut self, export_default_expr: &ExportDefaultExpr) {
        self.push_ancestor(
            AncestorKind::ExportDefaultDeclaration,
            export_default_expr.span,
        );
        export_default_expr.expr.visit_with(self);
        self.pop_ancestor();
    }

    fn visit_export_decl(&mut self, export_decl: &ExportDecl) {
        self.push_ancestor(AncestorKind::ExportNamedDeclaration, export_decl.span);
        export_decl.decl.visit_with(self);
        self.pop_ancestor();
    }

    fn visit_expr_stmt(&mut self, expr_stmt: &ExprStmt) {
        self.push_ancestor(AncestorKind::ExpressionStatement, expr_stmt.span);
        expr_stmt.expr.visit_with(self);
        self.pop_ancestor();
    }

    fn visit_member_expr(&mut self, member_expr: &MemberExpr) {
        member_expr.visit_children_with(self);

        if is_value_member_expr(member_expr) {
            self.mark_parent_component_or_hook(false, true);
        }
    }

    fn visit_object_pat(&mut self, object_pat: &ObjectPat) {
        object_pat.visit_children_with(self);

        if object_pattern_contains_value_property(object_pat) {
            self.mark_parent_component_or_hook(false, true);
        }
    }

    fn visit_jsx_element(&mut self, jsx_element: &JSXElement) {
        jsx_element.visit_children_with(self);
        self.mark_parent_component_or_hook(true, false);
    }

    fn visit_jsx_fragment(&mut self, jsx_fragment: &JSXFragment) {
        jsx_fragment.visit_children_with(self);
        self.mark_parent_component_or_hook(true, false);
    }
}

struct Mutator {
    options: PluginOptions,
    use_signals_ident: Ident,
    function_infos: HashMap<u32, FunctionInfo>,
    signal_name_injections: HashMap<u32, SignalNameInjection>,
    file_name: Option<String>,
}

impl Mutator {
    fn new(
        options: PluginOptions,
        use_signals_ident: Ident,
        function_infos: HashMap<u32, FunctionInfo>,
        signal_name_injections: HashMap<u32, SignalNameInjection>,
        file_name: Option<String>,
    ) -> Self {
        Self {
            options,
            use_signals_ident,
            function_infos,
            signal_name_injections,
            file_name,
        }
    }

    fn maybe_transform_function_body(&self, span: Span, body: BlockStmt) -> BlockStmt {
        let Some(function_info) = self.function_infos.get(&span.lo.0) else {
            return body;
        };

        if !function_info.should_transform {
            return body;
        }

        if self.options.no_try_finally() {
            prepend_use_signals_statement(
                body,
                &self.use_signals_ident,
                self.options.debug_enabled(),
                function_info.name.as_deref(),
            )
        } else {
            let usage = if function_info
                .name
                .as_deref()
                .map(is_custom_hook_name)
                .unwrap_or(false)
            {
                MANAGED_HOOK
            } else {
                MANAGED_COMPONENT
            };

            wrap_in_try_finally(
                body,
                &self.use_signals_ident,
                usage,
                self.options.debug_enabled(),
                function_info.name.as_deref(),
            )
        }
    }
}

impl VisitMut for Mutator {
    noop_visit_mut_type!();

    fn visit_mut_fn_decl(&mut self, fn_decl: &mut FnDecl) {
        fn_decl.function.visit_mut_with(self);

        if let Some(body) = fn_decl.function.body.take() {
            fn_decl.function.body =
                Some(self.maybe_transform_function_body(fn_decl.function.span, body));
        }
    }

    fn visit_mut_fn_expr(&mut self, fn_expr: &mut FnExpr) {
        fn_expr.function.visit_mut_with(self);

        if let Some(body) = fn_expr.function.body.take() {
            fn_expr.function.body =
                Some(self.maybe_transform_function_body(fn_expr.function.span, body));
        }
    }

    fn visit_mut_method_prop(&mut self, method_prop: &mut MethodProp) {
        method_prop.function.visit_mut_with(self);

        if let Some(body) = method_prop.function.body.take() {
            method_prop.function.body =
                Some(self.maybe_transform_function_body(method_prop.function.span, body));
        }
    }

    fn visit_mut_arrow_expr(&mut self, arrow_expr: &mut ArrowExpr) {
        arrow_expr.params.visit_mut_with(self);
        arrow_expr.body.visit_mut_with(self);

        let Some(function_info) = self.function_infos.get(&arrow_expr.span.lo.0) else {
            return;
        };

        if !function_info.should_transform {
            return;
        }

        let original_body = std::mem::replace(
            arrow_expr.body.as_mut(),
            BlockStmtOrExpr::BlockStmt(BlockStmt::default()),
        );

        let body = block_stmt_from_arrow_body(original_body);
        let new_body = if self.options.no_try_finally() {
            prepend_use_signals_statement(
                body,
                &self.use_signals_ident,
                self.options.debug_enabled(),
                function_info.name.as_deref(),
            )
        } else {
            let usage = if function_info
                .name
                .as_deref()
                .map(is_custom_hook_name)
                .unwrap_or(false)
            {
                MANAGED_HOOK
            } else {
                MANAGED_COMPONENT
            };
            wrap_in_try_finally(
                body,
                &self.use_signals_ident,
                usage,
                self.options.debug_enabled(),
                function_info.name.as_deref(),
            )
        };

        *arrow_expr.body = BlockStmtOrExpr::BlockStmt(new_body);
    }

    fn visit_mut_call_expr(&mut self, call_expr: &mut CallExpr) {
        call_expr.visit_mut_children_with(self);

        let Some(injection) = self.signal_name_injections.get(&call_expr.span.lo.0) else {
            return;
        };

        inject_signal_name(
            call_expr,
            &injection.variable_name,
            self.file_name.as_deref(),
            injection.line_number,
        );
    }
}

#[plugin_transform]
pub fn signals_react_transform_swc(
    mut program: Program,
    metadata: TransformPluginProgramMetadata,
) -> Program {
    let options = metadata
        .get_transform_plugin_config()
        .and_then(|config| serde_json::from_str::<PluginOptions>(&config).ok())
        .unwrap_or_default();

    let file_name = metadata
        .get_context(&TransformPluginMetadataContextKind::Filename)
        .and_then(|filename| basename(&filename).map(str::to_owned));

    let jsx_imports = if options.detect_transformed_jsx() {
        let mut collector = JsxImportCollector::new();
        program.visit_with(&mut collector);
        collector.state
    } else {
        JsxImportState::default()
    };

    let mut analyzer = Analyzer::new(
        options.clone(),
        file_name.clone(),
        Arc::new(metadata.source_map.clone()),
        metadata.comments,
        jsx_imports,
    );
    program.visit_with(&mut analyzer);

    let mut needs_import = false;
    let mut use_signals_ident = Ident::new_no_ctxt(GENERATED_USE_SIGNALS_IDENT.into(), DUMMY_SP);

    if analyzer.analysis.any_transform {
        if let Some(existing_ident) =
            find_existing_use_signals_binding(&program, options.import_source())
        {
            use_signals_ident = existing_ident;
        } else {
            needs_import = true;
        }
    }

    let mut mutator = Mutator::new(
        options.clone(),
        use_signals_ident.clone(),
        analyzer.analysis.functions,
        analyzer.analysis.signal_name_injections,
        file_name,
    );
    program.visit_mut_with(&mut mutator);

    if needs_import {
        insert_use_signals_import(&mut program, &use_signals_ident, options.import_source());
    }

    program
}

fn should_transform(options: &PluginOptions, function_context: &FunctionContext) -> bool {
    if function_context.opted_out {
        return false;
    }

    if function_context.opted_in {
        return true;
    }

    let is_component_function = function_context.contains_jsx
        && function_context
            .name
            .as_deref()
            .map(is_component_name)
            .unwrap_or(false);

    match options.mode() {
        PluginMode::All => is_component_function,
        PluginMode::Auto => {
            function_context.maybe_uses_signal
                && (is_component_function
                    || function_context
                        .name
                        .as_deref()
                        .map(is_custom_hook_name)
                        .unwrap_or(false))
        }
        PluginMode::Manual => false,
    }
}

fn basename(filename: &str) -> Option<&str> {
    filename
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
        .last()
}

fn jsx_package_methods(source: &str) -> Option<&'static [&'static str]> {
    match source {
        "react/jsx-runtime" => Some(&["jsx", "jsxs"]),
        "react/jsx-dev-runtime" => Some(&["jsxDEV"]),
        "react" => Some(&["createElement"]),
        _ => None,
    }
}

fn callee_identifier_name(callee: &Callee) -> Option<&str> {
    let Callee::Expr(expr) = callee else {
        return None;
    };

    let Expr::Ident(ident) = expr.as_ref() else {
        return None;
    };

    Some(ident.sym.as_ref())
}

fn require_source_from_expr(expr: &Expr) -> Option<String> {
    let Expr::Call(call_expr) = expr else {
        return None;
    };

    let Callee::Expr(callee_expr) = &call_expr.callee else {
        return None;
    };

    let Expr::Ident(callee_ident) = callee_expr.as_ref() else {
        return None;
    };

    if callee_ident.sym != *"require" {
        return None;
    }

    let Some(first_arg) = call_expr.args.first() else {
        return None;
    };

    let Expr::Lit(Lit::Str(string_literal)) = first_arg.expr.as_ref() else {
        return None;
    };

    Some(string_literal.value.to_string_lossy().into_owned())
}

fn module_export_name_to_string(name: &ModuleExportName) -> String {
    match name {
        ModuleExportName::Ident(ident) => ident.sym.to_string(),
        ModuleExportName::Str(string_literal) => {
            string_literal.value.to_string_lossy().into_owned()
        }
        _ => String::new(),
    }
}

fn prop_name_to_static_name(prop_name: &PropName) -> Option<&str> {
    match prop_name {
        PropName::Ident(ident) => Some(ident.sym.as_ref()),
        PropName::Str(string_literal) => string_literal.value.as_str(),
        PropName::Computed(computed) => match computed.expr.as_ref() {
            Expr::Lit(Lit::Str(string_literal)) => string_literal.value.as_str(),
            _ => None,
        },
        _ => None,
    }
}

fn member_prop_to_static_name(member_prop: &MemberProp) -> Option<&str> {
    match member_prop {
        MemberProp::Ident(ident) => Some(ident.sym.as_ref()),
        MemberProp::Computed(computed) => match computed.expr.as_ref() {
            Expr::Lit(Lit::Str(string_literal)) => string_literal.value.as_str(),
            _ => None,
        },
        MemberProp::PrivateName(_) => None,
        _ => None,
    }
}

fn is_component_name(name: &str) -> bool {
    name.chars()
        .next()
        .map(|character| character.is_ascii_uppercase())
        .unwrap_or(false)
}

fn is_custom_hook_name(name: &str) -> bool {
    let mut characters = name.chars();
    matches!(
        (
            characters.next(),
            characters.next(),
            characters.next(),
            characters.next()
        ),
        (Some('u'), Some('s'), Some('e'), Some(next)) if next.is_ascii_uppercase()
    )
}

fn matches_comment_marker(comment_text: &str, marker: CommentMarker) -> bool {
    let marker_text = match marker {
        CommentMarker::OptIn => ["@useSignals", "@trackSignals"],
        CommentMarker::OptOut => ["@noUseSignals", "@noTrackSignals"],
    };

    marker_text
        .iter()
        .any(|marker_text| contains_comment_token(comment_text, marker_text))
}

fn contains_comment_token(comment_text: &str, marker: &str) -> bool {
    let mut search_start = 0;
    while let Some(relative_idx) = comment_text[search_start..].find(marker) {
        let idx = search_start + relative_idx;
        let before_ok = idx == 0
            || comment_text[..idx]
                .chars()
                .last()
                .map(char::is_whitespace)
                .unwrap_or(true);
        let after_idx = idx + marker.len();
        let after_ok = after_idx == comment_text.len()
            || comment_text[after_idx..]
                .chars()
                .next()
                .map(char::is_whitespace)
                .unwrap_or(true);

        if before_ok && after_ok {
            return true;
        }

        search_start = after_idx;
    }

    false
}

fn has_leading_comment(
    comments: Option<PluginCommentsProxy>,
    pos: swc_core::common::BytePos,
    marker: CommentMarker,
) -> bool {
    comments
        .and_then(|comments| comments.get_leading(pos))
        .map(|leading_comments| {
            leading_comments
                .iter()
                .any(|comment| matches_comment_marker(&comment.text, marker))
        })
        .unwrap_or(false)
}

fn pat_ident_name(pattern: &Pat) -> Option<&str> {
    let Pat::Ident(binding_ident) = pattern else {
        return None;
    };

    Some(binding_ident.id.sym.as_ref())
}

fn assign_target_name(assign_target: &AssignTarget) -> Option<String> {
    match assign_target {
        AssignTarget::Simple(simple_assign_target) => match simple_assign_target {
            SimpleAssignTarget::Ident(binding_ident) => Some(binding_ident.id.sym.to_string()),
            SimpleAssignTarget::Member(member_expr) => member_expr_name(member_expr),
            _ => None,
        },
        AssignTarget::Pat(_) => None,
        _ => None,
    }
}

fn member_expr_name(member_expr: &MemberExpr) -> Option<String> {
    member_prop_to_static_name(&member_expr.prop).map(str::to_owned)
}

fn is_value_member_expr(member_expr: &MemberExpr) -> bool {
    matches!(member_prop_to_static_name(&member_expr.prop), Some("value"))
}

fn object_pattern_contains_value_property(object_pat: &ObjectPat) -> bool {
    object_pat.props.iter().any(|property| match property {
        ObjectPatProp::Assign(assign_pat_prop) => assign_pat_prop.key.id.sym == *"value",
        ObjectPatProp::KeyValue(key_value_pat_prop) => {
            if matches!(
                prop_name_to_static_name(&key_value_pat_prop.key),
                Some("value")
            ) {
                return true;
            }

            match key_value_pat_prop.value.as_ref() {
                Pat::Object(object_pat) => object_pattern_contains_value_property(object_pat),
                Pat::Assign(assign_pat) => match assign_pat.left.as_ref() {
                    Pat::Object(object_pat) => object_pattern_contains_value_property(object_pat),
                    _ => false,
                },
                _ => false,
            }
        }
        ObjectPatProp::Rest(rest_pat) => match rest_pat.arg.as_ref() {
            Pat::Object(object_pat) => object_pattern_contains_value_property(object_pat),
            _ => false,
        },
        _ => false,
    })
}

fn is_jsx_alternative_call(call_expr: &CallExpr, jsx_imports: &JsxImportState) -> bool {
    let Callee::Expr(callee_expr) = &call_expr.callee else {
        return false;
    };

    match callee_expr.as_ref() {
        Expr::Ident(ident) => jsx_imports.identifiers.contains(ident.sym.as_ref()),
        Expr::Member(member_expr) => {
            let Expr::Ident(object_ident) = member_expr.obj.as_ref() else {
                return false;
            };

            let Some(method_name) = member_prop_to_static_name(&member_expr.prop) else {
                return false;
            };

            jsx_imports
                .objects
                .get(object_ident.sym.as_ref())
                .map(|methods| methods.iter().any(|method| method == method_name))
                .unwrap_or(false)
        }
        _ => false,
    }
}

fn is_signal_call(call_expr: &CallExpr) -> bool {
    let Callee::Expr(expr) = &call_expr.callee else {
        return false;
    };

    let Expr::Ident(identifier) = expr.as_ref() else {
        return false;
    };

    matches!(
        identifier.sym.as_ref(),
        "signal" | "computed" | "useSignal" | "useComputed"
    )
}

fn has_name_in_options(call_expr: &CallExpr) -> bool {
    let Some(options_arg) = call_expr.args.get(1) else {
        return false;
    };

    let Expr::Object(object_lit) = options_arg.expr.as_ref() else {
        return false;
    };

    object_lit.props.iter().any(|prop| match prop {
        PropOrSpread::Prop(prop) => match prop.as_ref() {
            Prop::KeyValue(key_value_prop) => match &key_value_prop.key {
                PropName::Ident(identifier) => identifier.sym == *"name",
                PropName::Str(string_literal) => string_literal.value == *"name",
                PropName::Computed(computed) => match computed.expr.as_ref() {
                    Expr::Lit(Lit::Str(string_literal)) => string_literal.value == *"name",
                    _ => false,
                },
                _ => false,
            },
            _ => false,
        },
        _ => false,
    })
}

fn inject_signal_name(
    call_expr: &mut CallExpr,
    variable_name: &str,
    file_name: Option<&str>,
    line_number: usize,
) {
    let mut name_value = variable_name.to_owned();
    if let Some(file_name) = file_name {
        name_value = format!("{variable_name} ({file_name}:{line_number})");
    }

    let name_property = create_name_property(name_value);

    match call_expr.args.len() {
        0 => {
            call_expr.args.push(expr_arg(Expr::Ident(Ident::new_no_ctxt(
                "undefined".into(),
                DUMMY_SP,
            ))));
            call_expr
                .args
                .push(expr_arg(Expr::Object(object_lit(vec![name_property]))));
        }
        1 => {
            call_expr
                .args
                .push(expr_arg(Expr::Object(object_lit(vec![name_property]))));
        }
        _ => {
            if let Expr::Object(object_lit) = call_expr.args[1].expr.as_mut() {
                object_lit.props.push(name_property);
            } else {
                call_expr.args[1] = expr_arg(Expr::Object(object_lit(vec![name_property])));
            }
        }
    }
}

fn block_stmt_from_arrow_body(body: BlockStmtOrExpr) -> BlockStmt {
    match body {
        BlockStmtOrExpr::BlockStmt(block_stmt) => block_stmt,
        BlockStmtOrExpr::Expr(expr) => BlockStmt {
            span: DUMMY_SP,
            ctxt: SyntaxContext::empty(),
            stmts: vec![Stmt::Return(ReturnStmt {
                span: DUMMY_SP,
                arg: Some(expr),
            })],
        },
        _ => BlockStmt::default(),
    }
}

fn prepend_use_signals_statement(
    mut body: BlockStmt,
    use_signals_ident: &Ident,
    debug_enabled: bool,
    function_name: Option<&str>,
) -> BlockStmt {
    let mut statements = vec![Stmt::Expr(ExprStmt {
        span: DUMMY_SP,
        expr: Box::new(Expr::Call(create_use_signals_call(
            use_signals_ident,
            None,
            debug_enabled,
            function_name,
        ))),
    })];
    statements.append(&mut body.stmts);
    body.stmts = statements;
    body
}

fn wrap_in_try_finally(
    body: BlockStmt,
    use_signals_ident: &Ident,
    usage: u8,
    debug_enabled: bool,
    function_name: Option<&str>,
) -> BlockStmt {
    BlockStmt {
        span: DUMMY_SP,
        ctxt: SyntaxContext::empty(),
        stmts: vec![
            create_effect_var_decl(use_signals_ident, usage, debug_enabled, function_name),
            Stmt::Try(Box::new(TryStmt {
                span: DUMMY_SP,
                block: body,
                handler: None,
                finalizer: Some(BlockStmt {
                    span: DUMMY_SP,
                    ctxt: SyntaxContext::empty(),
                    stmts: vec![Stmt::Expr(ExprStmt {
                        span: DUMMY_SP,
                        expr: Box::new(Expr::Call(CallExpr {
                            span: DUMMY_SP,
                            ctxt: SyntaxContext::empty(),
                            callee: Callee::Expr(Box::new(Expr::Member(MemberExpr {
                                span: DUMMY_SP,
                                obj: Box::new(Expr::Ident(Ident::new_no_ctxt(
                                    GENERATED_EFFECT_IDENT.into(),
                                    DUMMY_SP,
                                ))),
                                prop: MemberProp::Ident(IdentName::new("f".into(), DUMMY_SP)),
                            }))),
                            args: vec![],
                            type_args: None,
                        })),
                    })],
                }),
            })),
        ],
    }
}

fn create_use_signals_call(
    use_signals_ident: &Ident,
    usage: Option<u8>,
    debug_enabled: bool,
    function_name: Option<&str>,
) -> CallExpr {
    let mut args = Vec::new();

    if let Some(usage) = usage {
        args.push(expr_arg(Expr::Lit(Lit::Num(Number::from(usage as usize)))));
        if debug_enabled {
            if let Some(function_name) = function_name {
                args.push(expr_arg(Expr::Lit(Lit::Str(string_lit(function_name)))));
            }
        }
    } else if debug_enabled {
        if let Some(function_name) = function_name {
            args.push(expr_arg(Expr::Ident(Ident::new_no_ctxt(
                "undefined".into(),
                DUMMY_SP,
            ))));
            args.push(expr_arg(Expr::Lit(Lit::Str(string_lit(function_name)))));
        }
    }

    CallExpr {
        span: DUMMY_SP,
        ctxt: SyntaxContext::empty(),
        callee: Callee::Expr(Box::new(Expr::Ident(use_signals_ident.clone()))),
        args,
        type_args: None,
    }
}

fn create_effect_var_decl(
    use_signals_ident: &Ident,
    usage: u8,
    debug_enabled: bool,
    function_name: Option<&str>,
) -> Stmt {
    Stmt::Decl(Decl::Var(Box::new(VarDecl {
        span: DUMMY_SP,
        ctxt: SyntaxContext::empty(),
        kind: VarDeclKind::Var,
        declare: false,
        decls: vec![VarDeclarator {
            span: DUMMY_SP,
            definite: false,
            name: Pat::Ident(BindingIdent {
                id: Ident::new_no_ctxt(GENERATED_EFFECT_IDENT.into(), DUMMY_SP),
                type_ann: None,
            }),
            init: Some(Box::new(Expr::Call(create_use_signals_call(
                use_signals_ident,
                Some(usage),
                debug_enabled,
                function_name,
            )))),
        }],
    })))
}

fn find_existing_use_signals_binding(program: &Program, source: &str) -> Option<Ident> {
    match program {
        Program::Module(module) => module.body.iter().find_map(|item| {
            let ModuleItem::ModuleDecl(ModuleDecl::Import(import_decl)) = item else {
                return None;
            };

            if import_decl.src.value != *source {
                return None;
            }

            import_decl.specifiers.iter().find_map(|specifier| {
                let ImportSpecifier::Named(named) = specifier else {
                    return None;
                };

                let imported = named
                    .imported
                    .as_ref()
                    .map(module_export_name_to_string)
                    .unwrap_or_else(|| named.local.sym.to_string());

                if imported == USE_SIGNALS_IMPORT {
                    Some(named.local.clone())
                } else {
                    None
                }
            })
        }),
        Program::Script(script) => script.body.iter().find_map(|statement| {
            let Stmt::Decl(Decl::Var(var_decl)) = statement else {
                return None;
            };

            var_decl.decls.iter().find_map(|declarator| {
                let Pat::Ident(binding_ident) = &declarator.name else {
                    return None;
                };
                let Some(init) = &declarator.init else {
                    return None;
                };

                let Expr::Member(member_expr) = init.as_ref() else {
                    return None;
                };

                if !matches!(
                    member_prop_to_static_name(&member_expr.prop),
                    Some(USE_SIGNALS_IMPORT)
                ) {
                    return None;
                }

                let Some(require_source) = require_source_from_expr(member_expr.obj.as_ref())
                else {
                    return None;
                };

                if require_source == source {
                    Some(binding_ident.id.clone())
                } else {
                    None
                }
            })
        }),
        _ => None,
    }
}

fn insert_use_signals_import(program: &mut Program, use_signals_ident: &Ident, source: &str) {
    match program {
        Program::Module(module) => {
            let import_decl = ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                span: DUMMY_SP,
                specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                    span: DUMMY_SP,
                    local: use_signals_ident.clone(),
                    imported: Some(ModuleExportName::Ident(Ident::new_no_ctxt(
                        USE_SIGNALS_IMPORT.into(),
                        DUMMY_SP,
                    ))),
                    is_type_only: false,
                })],
                src: Box::new(string_lit(source)),
                type_only: false,
                with: None,
                phase: ImportPhase::Evaluation,
            }));

            let insert_index = module
                .body
                .iter()
                .take_while(|item| matches!(item, ModuleItem::ModuleDecl(ModuleDecl::Import(_))))
                .count();
            module.body.insert(insert_index, import_decl);
        }
        Program::Script(script) => {
            script.body.insert(
                0,
                create_use_signals_require_stmt(use_signals_ident, source),
            );
        }
        _ => {}
    }
}

fn create_use_signals_require_stmt(use_signals_ident: &Ident, source: &str) -> Stmt {
    Stmt::Decl(Decl::Var(Box::new(VarDecl {
        span: DUMMY_SP,
        ctxt: SyntaxContext::empty(),
        kind: VarDeclKind::Var,
        declare: false,
        decls: vec![VarDeclarator {
            span: DUMMY_SP,
            definite: false,
            name: Pat::Ident(BindingIdent {
                id: use_signals_ident.clone(),
                type_ann: None,
            }),
            init: Some(Box::new(Expr::Member(MemberExpr {
                span: DUMMY_SP,
                obj: Box::new(Expr::Call(CallExpr {
                    span: DUMMY_SP,
                    ctxt: SyntaxContext::empty(),
                    callee: Callee::Expr(Box::new(Expr::Ident(Ident::new_no_ctxt(
                        "require".into(),
                        DUMMY_SP,
                    )))),
                    args: vec![expr_arg(Expr::Lit(Lit::Str(string_lit(source))))],
                    type_args: None,
                })),
                prop: MemberProp::Ident(IdentName::new(USE_SIGNALS_IMPORT.into(), DUMMY_SP)),
            }))),
        }],
    })))
}

fn create_name_property(name_value: String) -> PropOrSpread {
    PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
        key: PropName::Ident(IdentName::new("name".into(), DUMMY_SP)),
        value: Box::new(Expr::Lit(Lit::Str(Str {
            span: DUMMY_SP,
            value: name_value.into(),
            raw: None,
        }))),
    })))
}

fn expr_arg(expr: Expr) -> ExprOrSpread {
    ExprOrSpread {
        spread: None,
        expr: Box::new(expr),
    }
}

fn object_lit(props: Vec<PropOrSpread>) -> ObjectLit {
    ObjectLit {
        span: DUMMY_SP,
        props,
    }
}

fn string_lit(value: &str) -> Str {
    Str {
        span: DUMMY_SP,
        value: value.into(),
        raw: None,
    }
}
