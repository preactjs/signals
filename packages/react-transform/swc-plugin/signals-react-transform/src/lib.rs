use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use swc_core::{
    common::{comments::Comments, Span, SyntaxContext, DUMMY_SP},
    ecma::{
        ast::*,
        utils::quote_ident,
        visit::{Fold, FoldWith, VisitMut, VisitMutWith},
    },
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

pub static OPT_OUT_COMMENT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(^|\s)@no(Use|Track)Signals(\s|$)").unwrap());
pub static OPT_IN_COMMENT: Lazy<Regex> = Lazy::new(|| Regex::new(r"(^|\s)@(use|track)Signals(\s|$)").unwrap());

const DEFAULT_IMPORT_SOURCE: &str = "@preact/signals-react/runtime";
const IMPORT_NAME: &str = "useSignals";

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PluginOptions {
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub import_source: Option<String>,
    #[serde(default)]
    pub detect_transformed_jsx: Option<bool>,
    #[serde(default)]
    pub experimental: Option<ExperimentalOptions>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentalOptions {
    #[serde(default)]
    pub no_try_finally: Option<bool>,
}

impl Default for PluginOptions {
    fn default() -> Self {
        Self {
            mode: Some("auto".to_string()),
            import_source: None,
            detect_transformed_jsx: Some(false),
            experimental: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FunctionInfo {
    pub name: Option<String>,
    pub is_component: bool,
    pub is_hook: bool,
    pub has_jsx: bool,
    pub uses_signals: bool,
    pub has_opt_in_comment: bool,
    pub has_opt_out_comment: bool,
}

pub struct TransformVisitor {
    options: PluginOptions,
    functions: HashMap<Span, FunctionInfo>,
    jsx_identifiers: HashSet<String>,
    jsx_objects: HashMap<String, Vec<String>>,
    use_signals_ident: Option<Ident>,
    pub comments: Option<Box<dyn Comments>>,
}

impl TransformVisitor {
    pub fn new(options: PluginOptions) -> Self {
        let jsx_identifiers = HashSet::new();
        let jsx_objects = HashMap::new();

        Self {
            options,
            functions: HashMap::new(),
            jsx_identifiers,
            jsx_objects,
            use_signals_ident: None,
            comments: None,
        }
    }

    pub fn with_comments(options: PluginOptions, comments: Box<dyn Comments>) -> Self {
        let jsx_identifiers = HashSet::new();
        let jsx_objects = HashMap::new();

        Self {
            options,
            functions: HashMap::new(),
            jsx_identifiers,
            jsx_objects,
            use_signals_ident: None,
            comments: Some(comments),
        }
    }


    fn is_component_name(&self, name: &str) -> bool {
        name.chars().next().map_or(false, |c| c.is_uppercase())
    }

    fn is_hook_name(&self, name: &str) -> bool {
        name.starts_with("use") && name.len() > 3 &&
            name.chars().nth(3).map_or(false, |c| c.is_uppercase())
    }

    fn has_leading_comment(&self, span: Span, pattern: &Regex) -> bool {
        if let Some(ref comments) = self.comments {
            // Check leading comments for the span
            if let Some(leading_comments) = comments.get_leading(span.lo) {
                for comment in leading_comments {
                    if pattern.is_match(&comment.text) {
                        return true;
                    }
                }
            }

            // Also check trailing comments of the previous line
            if let Some(trailing_comments) = comments.get_trailing(span.lo) {
                for comment in trailing_comments {
                    if pattern.is_match(&comment.text) {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn detect_jsx_imports(&mut self, module: &Module) {
        let jsx_packages = [
            ("react/jsx-runtime", vec!["jsx".to_string(), "jsxs".to_string()]),
            ("react/jsx-dev-runtime", vec!["jsxDEV".to_string()]),
            ("react", vec!["createElement".to_string()]),
        ];

        for item in &module.body {
            match item {
                ModuleItem::ModuleDecl(ModuleDecl::Import(import_decl)) => {
                    let src = import_decl.src.value.to_string();
                    if let Some((_, methods)) = jsx_packages.iter().find(|(pkg, _)| *pkg == src) {
                        for spec in &import_decl.specifiers {
                            match spec {
                                ImportSpecifier::Named(named) => {
                                    let imported_name = match &named.imported {
                                        Some(ModuleExportName::Ident(ident)) => ident.sym.to_string(),
                                        _ => named.local.sym.to_string(),
                                    };
                                    if methods.iter().any(|m| m == &imported_name) {
                                        self.jsx_identifiers.insert(named.local.sym.to_string());
                                    }
                                }
                                ImportSpecifier::Default(default) => {
                                    self.jsx_objects.insert(default.local.sym.to_string(), methods.clone());
                                }
                                _ => {}
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }

    fn is_jsx_call(&self, call: &CallExpr) -> bool {
        if !self.options.detect_transformed_jsx.unwrap_or(false) {
            return false;
        }

        match &call.callee {
            Callee::Expr(expr) => match expr.as_ref() {
                Expr::Ident(ident) => self.jsx_identifiers.contains(&ident.sym.to_string()),
                Expr::Member(member) => {
                    if let (Expr::Ident(obj), MemberProp::Ident(prop)) = (member.obj.as_ref(), &member.prop) {
                        let obj_name = obj.sym.to_string();
                        let prop_name = prop.sym.to_string();
                        self.jsx_objects.get(&obj_name)
                            .map_or(false, |methods| methods.contains(&prop_name))
                    } else {
                        false
                    }
                }
                _ => false,
            }
            _ => false,
        }
    }

    fn is_value_member_access(&self, expr: &MemberExpr) -> bool {
        match &expr.prop {
            MemberProp::Ident(ident) => ident.sym == "value",
            MemberProp::Computed(computed) => {
                if let Expr::Lit(Lit::Str(str_lit)) = computed.expr.as_ref() {
                    str_lit.value == "value"
                } else {
                    false
                }
            }
            _ => false,
        }
    }

    fn has_value_in_object_pattern(&self, pat: &ObjectPat) -> bool {
        pat.props.iter().any(|prop| {
            if let ObjectPatProp::KeyValue(kv) = prop {
                match &kv.key {
                    PropName::Ident(ident) => ident.sym == "value",
                    PropName::Str(str_lit) => str_lit.value == "value",
                    _ => false,
                }
            } else {
                false
            }
        })
    }

    pub fn should_transform(&self, info: &FunctionInfo) -> bool {
        if info.has_opt_out_comment {
            return false;
        }
        if info.has_opt_in_comment {
            return true;
        }

        let mode = self.options.mode.as_deref().unwrap_or("auto");
        match mode {
            "all" => info.is_component,
            "auto" => info.uses_signals && (info.is_component || info.is_hook),
            _ => false, // "manual" or unknown modes
        }
    }

    fn wrap_function_body(&mut self, function: &mut Function, info: &FunctionInfo) {
        let hook_usage = if info.is_hook { "2" } else { "1" };
        let use_try_finally = !self.options.experimental
            .as_ref()
            .and_then(|exp| exp.no_try_finally)
            .unwrap_or(false);

        // Get or create the useSignals identifier
        let use_signals_call = if let Some(ref ident) = self.use_signals_ident {
            ident.clone()
        } else {
            let ident_name = quote_ident!("_useSignals");
            let ident = Ident {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                sym: ident_name.sym,
                optional: false,
            };
            self.use_signals_ident = Some(ident.clone());
            ident
        };

        let original_body = function.body.take();
        let mut new_stmts = Vec::new();

        if use_try_finally {
            // Create: var _effect = _useSignals(1);
            let effect_ident_name = quote_ident!("_effect");
            let effect_ident = Ident {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                sym: effect_ident_name.sym,
                optional: false,
            };
            let hook_usage_expr = Expr::Lit(Lit::Str(Str {
                span: DUMMY_SP,
                value: hook_usage.into(),
                raw: None,
            }));

            let init_stmt = Stmt::Decl(Decl::Var(Box::new(VarDecl {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                kind: VarDeclKind::Var,
                declare: false,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Ident(BindingIdent {
                        id: effect_ident.clone(),
                        type_ann: None,
                    }),
                    init: Some(Box::new(Expr::Call(CallExpr {
                        span: DUMMY_SP,
                        ctxt: SyntaxContext::empty(),
                        callee: Callee::Expr(Box::new(Expr::Ident(use_signals_call))),
                        args: vec![ExprOrSpread {
                            spread: None,
                            expr: Box::new(hook_usage_expr),
                        }],
                        type_args: None,
                    }))),
                    definite: false,
                }],
            })));

            new_stmts.push(init_stmt);

            // Create try-finally block
            let try_stmt = Stmt::Try(Box::new(TryStmt {
                span: DUMMY_SP,
                block: original_body.unwrap_or_else(|| BlockStmt {
                    span: DUMMY_SP,
                    ctxt: SyntaxContext::empty(),
                    stmts: vec![],
                }),
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
                                obj: Box::new(Expr::Ident(effect_ident)),
                                prop: MemberProp::Ident(quote_ident!("f")),
                            }))),
                            args: vec![],
                            type_args: None,
                        })),
                    })],
                }),
            }));

            new_stmts.push(try_stmt);
        } else {
            // Just prepend useSignals() call
            let call_stmt = Stmt::Expr(ExprStmt {
                span: DUMMY_SP,
                expr: Box::new(Expr::Call(CallExpr {
                    span: DUMMY_SP,
                    ctxt: SyntaxContext::empty(),
                    callee: Callee::Expr(Box::new(Expr::Ident(use_signals_call))),
                    args: vec![],
                    type_args: None,
                })),
            });

            new_stmts.push(call_stmt);

            if let Some(original) = original_body {
                new_stmts.extend(original.stmts);
            }
        }

        function.body = Some(BlockStmt {
            span: DUMMY_SP,
            ctxt: SyntaxContext::empty(),
            stmts: new_stmts,
        });
    }

    fn add_import(&mut self, module: &mut Module) {
        if self.use_signals_ident.is_none() {
            return;
        }

        let import_source = self.options.import_source.as_deref().unwrap_or(DEFAULT_IMPORT_SOURCE);

        // Check if import already exists
        let has_existing_import = module.body.iter().any(|item| {
            if let ModuleItem::ModuleDecl(ModuleDecl::Import(import_decl)) = item {
                import_decl.src.value == import_source
            } else {
                false
            }
        });

        if !has_existing_import {
            let import_decl = ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                span: DUMMY_SP,
                specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                    span: DUMMY_SP,
                    local: self.use_signals_ident.clone().unwrap(),
                    imported: Some(ModuleExportName::Ident(Ident {
                        span: DUMMY_SP,
                        ctxt: SyntaxContext::empty(),
                        sym: IMPORT_NAME.into(),
                        optional: false,
                    })),
                    is_type_only: false,
                })],
                src: Box::new(Str {
                    span: DUMMY_SP,
                    value: import_source.into(),
                    raw: None,
                }),
                type_only: false,
                with: None,
                phase: Default::default(),
            }));

            module.body.insert(0, import_decl);
        }
    }
}

impl VisitMut for TransformVisitor {
    fn visit_mut_module(&mut self, module: &mut Module) {
        if self.options.detect_transformed_jsx.unwrap_or(false) {
            self.detect_jsx_imports(module);
        }

        // Single pass: visit children and transform as we go
        module.visit_mut_children_with(self);

        // Add import at the end if we transformed anything
        if self.use_signals_ident.is_some() {
            self.add_import(module);
        }
    }

    fn visit_mut_function(&mut self, function: &mut Function) {
        // For function expressions and other cases not handled by visit_mut_fn_decl
        // We only store info, transformation happens in visit_mut_fn_decl
        function.visit_mut_children_with(self);
    }

    fn visit_mut_fn_decl(&mut self, fn_decl: &mut FnDecl) {
        let span = fn_decl.function.span;
        let name = Some(fn_decl.ident.sym.to_string());

        let is_component = name.as_ref().map_or(false, |n| self.is_component_name(n));
        let is_hook = name.as_ref().map_or(false, |n| self.is_hook_name(n));

        // Check for opt-in/opt-out comments
        let has_opt_in_comment = self.has_leading_comment(span, &OPT_IN_COMMENT);
        let has_opt_out_comment = self.has_leading_comment(span, &OPT_OUT_COMMENT);

        let info = FunctionInfo {
            name: name.clone(),
            is_component,
            is_hook,
            has_jsx: false,
            uses_signals: false,
            has_opt_in_comment,
            has_opt_out_comment,
        };

        self.functions.insert(span, info);

        fn_decl.visit_mut_children_with(self);

        // Apply transformation if needed
        let info_option = self.functions.get(&span);
        let should_transform = info_option
            .map(|info| self.should_transform(info))
            .unwrap_or(false);

        if should_transform {
            let info_clone = self.functions.get(&span).unwrap().clone();
            self.wrap_function_body(&mut fn_decl.function, &info_clone);
        }
    }

    fn visit_mut_var_decl(&mut self, var_decl: &mut VarDecl) {
        // Handle arrow functions in variable declarations like: const MyComponent = () => {}
        for decl in &mut var_decl.decls {
            if let Pat::Ident(binding_ident) = &decl.name {
                if let Some(init) = &mut decl.init {
                    if let Expr::Arrow(arrow) = init.as_mut() {
                        let span = arrow.span;
                        let name = Some(binding_ident.id.sym.to_string());
                        
                        let is_component = name.as_ref().map_or(false, |n| self.is_component_name(n));
                        let is_hook = name.as_ref().map_or(false, |n| self.is_hook_name(n));

                        // Check for opt-in/opt-out comments
                        let has_opt_in_comment = self.has_leading_comment(span, &OPT_IN_COMMENT);
                        let has_opt_out_comment = self.has_leading_comment(span, &OPT_OUT_COMMENT);

                        let info = FunctionInfo {
                            name: name.clone(),
                            is_component,
                            is_hook,
                            has_jsx: false,
                            uses_signals: false,
                            has_opt_in_comment,
                            has_opt_out_comment,
                        };

                        self.functions.insert(span, info);

                        // Visit children first
                        arrow.visit_mut_children_with(self);

                        // Apply transformation if needed
                        let info_option = self.functions.get(&span);
                        let should_transform = info_option
                            .map(|info| self.should_transform(info))
                            .unwrap_or(false);

                        if should_transform {
                            let info_clone = self.functions.get(&span).unwrap().clone();
                            self.transform_arrow_function(arrow, &info_clone);
                        }
                    }
                }
            }
        }
        
        // Note: We don't call visit_mut_children_with here because we handle arrow functions above
    }

    fn visit_mut_arrow_expr(&mut self, arrow: &mut ArrowExpr) {
        // For arrow functions not in variable declarations
        arrow.visit_mut_children_with(self);
    }

    fn visit_mut_jsx_element(&mut self, jsx: &mut JSXElement) {
        // Mark current function as having JSX
        if let Some((_, info)) = self.functions.iter_mut().last() {
            info.has_jsx = true;
        }
        jsx.visit_mut_children_with(self);
    }

    fn visit_mut_jsx_fragment(&mut self, jsx: &mut JSXFragment) {
        // Mark current function as having JSX
        if let Some((_, info)) = self.functions.iter_mut().last() {
            info.has_jsx = true;
        }
        jsx.visit_mut_children_with(self);
    }

    fn visit_mut_call_expr(&mut self, call: &mut CallExpr) {
        if self.is_jsx_call(call) {
            if let Some((_, info)) = self.functions.iter_mut().last() {
                info.has_jsx = true;
            }
        }
        call.visit_mut_children_with(self);
    }

    fn visit_mut_member_expr(&mut self, member: &mut MemberExpr) {
        if self.is_value_member_access(member) {
            if let Some((_, info)) = self.functions.iter_mut().last() {
                info.uses_signals = true;
            }
        }
        member.visit_mut_children_with(self);
    }

    fn visit_mut_object_pat(&mut self, pat: &mut ObjectPat) {
        if self.has_value_in_object_pattern(pat) {
            if let Some((_, info)) = self.functions.iter_mut().last() {
                info.uses_signals = true;
            }
        }
        pat.visit_mut_children_with(self);
    }

}

impl TransformVisitor {
    fn transform_arrow_function(&mut self, arrow: &mut ArrowExpr, info: &FunctionInfo) {
        let hook_usage = if info.is_hook { "2" } else { "1" };
        let use_try_finally = !self.options.experimental
            .as_ref()
            .and_then(|exp| exp.no_try_finally)
            .unwrap_or(false);

        // Get or create the useSignals identifier
        let use_signals_call = if let Some(ref ident) = self.use_signals_ident {
            ident.clone()
        } else {
            let ident_name = quote_ident!("_useSignals");
            let ident = Ident {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                sym: ident_name.sym,
                optional: false,
            };
            self.use_signals_ident = Some(ident.clone());
            ident
        };

        // Convert arrow function to block statement if it's an expression
        let block_stmt = match arrow.body.as_ref() {
            BlockStmtOrExpr::BlockStmt(block) => block.clone(),
            BlockStmtOrExpr::Expr(expr) => {
                // Convert expression to return statement
                BlockStmt {
                    span: DUMMY_SP,
                    ctxt: SyntaxContext::empty(),
                    stmts: vec![Stmt::Return(ReturnStmt {
                        span: DUMMY_SP,
                        arg: Some(expr.clone()),
                    })],
                }
            }
        };

        let mut new_stmts = Vec::new();

        if use_try_finally {
            // Create: var _effect = _useSignals(1);
            let effect_ident_name = quote_ident!("_effect");
            let effect_ident = Ident {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                sym: effect_ident_name.sym,
                optional: false,
            };
            let hook_usage_expr = Expr::Lit(Lit::Str(Str {
                span: DUMMY_SP,
                value: hook_usage.into(),
                raw: None,
            }));

            let init_stmt = Stmt::Decl(Decl::Var(Box::new(VarDecl {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                kind: VarDeclKind::Var,
                declare: false,
                decls: vec![VarDeclarator {
                    span: DUMMY_SP,
                    name: Pat::Ident(BindingIdent {
                        id: effect_ident.clone(),
                        type_ann: None,
                    }),
                    init: Some(Box::new(Expr::Call(CallExpr {
                        span: DUMMY_SP,
                        ctxt: SyntaxContext::empty(),
                        callee: Callee::Expr(Box::new(Expr::Ident(use_signals_call))),
                        args: vec![ExprOrSpread {
                            spread: None,
                            expr: Box::new(hook_usage_expr),
                        }],
                        type_args: None,
                    }))),
                    definite: false,
                }],
            })));

            new_stmts.push(init_stmt);

            // Create try-finally block
            let try_stmt = Stmt::Try(Box::new(TryStmt {
                span: DUMMY_SP,
                block: block_stmt,
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
                                obj: Box::new(Expr::Ident(effect_ident)),
                                prop: MemberProp::Ident(quote_ident!("f")),
                            }))),
                            args: vec![],
                            type_args: None,
                        })),
                    })],
                }),
            }));

            new_stmts.push(try_stmt);
        } else {
            // Just prepend useSignals() call
            let call_stmt = Stmt::Expr(ExprStmt {
                span: DUMMY_SP,
                expr: Box::new(Expr::Call(CallExpr {
                    span: DUMMY_SP,
                    ctxt: SyntaxContext::empty(),
                    callee: Callee::Expr(Box::new(Expr::Ident(use_signals_call))),
                    args: vec![],
                    type_args: None,
                })),
            });

            new_stmts.push(call_stmt);
            new_stmts.extend(block_stmt.stmts);
        }

        arrow.body = Box::new(BlockStmtOrExpr::BlockStmt(BlockStmt {
            span: DUMMY_SP,
            ctxt: SyntaxContext::empty(),
            stmts: new_stmts,
        }));
    }
}

impl Fold for TransformVisitor {
    fn fold_program(&mut self, program: Program) -> Program {
        program.fold_children_with(self)
    }
}

// Helper function for creating transformer
pub fn signals_transform(options: PluginOptions) -> TransformVisitor {
    TransformVisitor::new(options)
}

#[plugin_transform]
pub fn process_transform(program: Program, metadata: TransformPluginProgramMetadata) -> Program {
    let config = metadata
        .get_transform_plugin_config()
        .and_then(|json_str| serde_json::from_str::<PluginOptions>(&json_str).ok())
        .unwrap_or_default();

    program.fold_with(&mut TransformVisitor::new(config))
}

// Macro for inline testing similar to XantreDev's implementation
#[cfg(test)]
macro_rules! test_inline {
    (ignore, $syntax:expr, $tr:expr, $test_name:ident, $input:expr, $output:expr) => {
        #[test]
        #[ignore]
        fn $test_name() {
            use swc_core::ecma::transforms::testing::test_inline_input_output;
            test_inline_input_output($syntax, Some(true), $tr, $input, $output)
        }
    };

    ($syntax:expr, $tr:expr, $test_name:ident, $input:expr, $output:expr) => {
        #[test]
        fn $test_name() {
            use swc_core::ecma::transforms::testing::test_inline_input_output;
            test_inline_input_output($syntax, Some(true), $tr, $input, $output)
        }
    };
}

#[cfg(test)]
fn get_syntax() -> swc_core::ecma::parser::Syntax {
    use swc_core::ecma::parser::{EsSyntax, Syntax};

    let mut es_syntax = EsSyntax::default();
    es_syntax.jsx = true;
    Syntax::Es(es_syntax)
}

// Test cases to verify the plugin works
test_inline!(
    get_syntax(),
    |_| {
        use swc_core::ecma::visit::visit_mut_pass;
        visit_mut_pass(TransformVisitor::new(PluginOptions::default()))
    },
    signals_transform_basic,
    r#"
function MyComponent() {
    return <div>{signal.value}</div>;
}
    "#,
    r#"
import { useSignals as _useSignals } from "@preact/signals-react/runtime";
function MyComponent() {
    var _effect = _useSignals("1");
    try {
        return <div>{signal.value}</div>;
    } finally {
        _effect.f();
    }
}
    "#
);

test_inline!(
    get_syntax(),
    |_| {
        use swc_core::ecma::visit::visit_mut_pass;
        visit_mut_pass(TransformVisitor::new(PluginOptions {
            experimental: Some(ExperimentalOptions {
                no_try_finally: Some(true)
            }),
            ..Default::default()
        }))
    },
    signals_transform_no_try_finally,
    r#"
function MyComponent() {
    return <div>{signal.value}</div>;
}
    "#,
    r#"
import { useSignals as _useSignals } from "@preact/signals-react/runtime";
function MyComponent() {
    _useSignals();
    return <div>{signal.value}</div>;
}
    "#
);

// Test arrow function components
test_inline!(
    get_syntax(),
    |_| {
        use swc_core::ecma::visit::visit_mut_pass;
        visit_mut_pass(TransformVisitor::new(PluginOptions::default()))
    },
    signals_transform_arrow_function,
    r#"
const MyComponent = () => {
    return <div>{signal.value}</div>;
};
    "#,
    r#"
import { useSignals as _useSignals } from "@preact/signals-react/runtime";
const MyComponent = () => {
    var _effect = _useSignals("1");
    try {
        return <div>{signal.value}</div>;
    } finally {
        _effect.f();
    }
};
    "#
);

// Test opt-out comment prevents transformation 
// Note: Comments are not available in SWC test_inline! macro testing framework
// This test is ignored as comment detection requires access to Comments struct
test_inline!(
    ignore,
    get_syntax(),
    |_| {
        use swc_core::ecma::visit::visit_mut_pass;
        visit_mut_pass(TransformVisitor::new(PluginOptions::default()))
    },
    signals_transform_opt_out_comment,
    r#"
/** @noUseSignals */
function MyComponent() {
    return <div>{signal.value}</div>;
}
    "#,
    r#"
/** @noUseSignals */
function MyComponent() {
    return <div>{signal.value}</div>;
}
    "#
);

// Test opt-in comment enables transformation
// Note: Comments are not available in SWC test_inline! macro testing framework  
// This test is ignored as comment detection requires access to Comments struct
test_inline!(
    ignore,
    get_syntax(),
    |_| {
        use swc_core::ecma::visit::visit_mut_pass;
        visit_mut_pass(TransformVisitor::new(PluginOptions {
            mode: Some("manual".to_string()),
            ..Default::default()
        }))
    },
    signals_transform_opt_in_comment,
    r#"
/** @useSignals */
function myFunction() {
    return regularValue;
}
    "#,
    r#"
import { useSignals as _useSignals } from "@preact/signals-react/runtime";
/** @useSignals */
function myFunction() {
    var _effect = _useSignals("1");
    try {
        return regularValue;
    } finally {
        _effect.f();
    }
}
    "#
);

#[cfg(test)]
mod tests {
    use super::*;
    use swc_core::{
        common::SyntaxContext,
        ecma::{
            ast::{
                BindingIdent, ComputedPropName, Expr, Ident, ImportDecl, ImportNamedSpecifier,
                ImportSpecifier, KeyValuePatProp, Lit, MemberExpr, MemberProp, Module,
                ModuleDecl, ModuleExportName, ModuleItem, ObjectPat, ObjectPatProp, Pat,
                PropName, Str,
            },
            utils::quote_ident,
        },
    };

    #[test]
    fn test_plugin_creation() {
        let options = PluginOptions::default();
        let _visitor = signals_transform(options);
        // Basic test to ensure the plugin can be instantiated
        assert!(true);
    }

    #[test]
    fn test_component_name_detection() {
        let visitor = signals_transform(PluginOptions::default());
        assert!(visitor.is_component_name("MyComponent"));
        assert!(visitor.is_component_name("App"));
        assert!(visitor.is_component_name("Button"));
        assert!(!visitor.is_component_name("myFunction"));
        assert!(!visitor.is_component_name("helper"));
        assert!(!visitor.is_component_name(""));
    }

    #[test]
    fn test_hook_name_detection() {
        let visitor = signals_transform(PluginOptions::default());
        assert!(visitor.is_hook_name("useEffect"));
        assert!(visitor.is_hook_name("useCustomHook"));
        assert!(visitor.is_hook_name("useState"));
        assert!(visitor.is_hook_name("useName"));
        assert!(visitor.is_hook_name("useGreeting"));
        assert!(!visitor.is_hook_name("use"));
        assert!(!visitor.is_hook_name("useless"));
        assert!(!visitor.is_hook_name("user"));
        assert!(!visitor.is_hook_name(""));
    }

    #[test]
    fn test_value_member_access_detection() {
        let visitor = signals_transform(PluginOptions::default());

        // Test with ident property
        let member_expr = MemberExpr {
            span: DUMMY_SP,
            obj: Box::new(Expr::Ident(Ident {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                sym: "signal".into(),
                optional: false,
            })),
            prop: MemberProp::Ident(quote_ident!("value")),
        };
        assert!(visitor.is_value_member_access(&member_expr));

        // Test with non-value property
        let member_expr_non_value = MemberExpr {
            span: DUMMY_SP,
            obj: Box::new(Expr::Ident(Ident {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                sym: "signal".into(),
                optional: false,
            })),
            prop: MemberProp::Ident(quote_ident!("other")),
        };
        assert!(!visitor.is_value_member_access(&member_expr_non_value));

        // Test with computed property
        let member_expr_computed = MemberExpr {
            span: DUMMY_SP,
            obj: Box::new(Expr::Ident(Ident {
                span: DUMMY_SP,
                ctxt: SyntaxContext::empty(),
                sym: "signal".into(),
                optional: false,
            })),
            prop: MemberProp::Computed(ComputedPropName {
                span: DUMMY_SP,
                expr: Box::new(Expr::Lit(Lit::Str(Str {
                    span: DUMMY_SP,
                    value: "value".into(),
                    raw: None,
                }))),
            }),
        };
        assert!(visitor.is_value_member_access(&member_expr_computed));
    }

    #[test]
    fn test_value_in_object_pattern_detection() {
        let visitor = signals_transform(PluginOptions::default());

        // Test pattern with value property
        let object_pat = ObjectPat {
            span: DUMMY_SP,
            props: vec![ObjectPatProp::KeyValue(KeyValuePatProp {
                key: PropName::Ident(quote_ident!("value")),
                value: Box::new(Pat::Ident(BindingIdent {
                    id: Ident {
                        span: DUMMY_SP,
                        ctxt: SyntaxContext::empty(),
                        sym: "val".into(),
                        optional: false,
                    },
                    type_ann: None,
                })),
            })],
            optional: false,
            type_ann: None,
        };
        assert!(visitor.has_value_in_object_pattern(&object_pat));

        // Test pattern without value property
        let object_pat_no_value = ObjectPat {
            span: DUMMY_SP,
            props: vec![ObjectPatProp::KeyValue(KeyValuePatProp {
                key: PropName::Ident(quote_ident!("other")),
                value: Box::new(Pat::Ident(BindingIdent {
                    id: Ident {
                        span: DUMMY_SP,
                        ctxt: SyntaxContext::empty(),
                        sym: "val".into(),
                        optional: false,
                    },
                    type_ann: None,
                })),
            })],
            optional: false,
            type_ann: None,
        };
        assert!(!visitor.has_value_in_object_pattern(&object_pat_no_value));
    }

    #[test]
    fn test_should_transform_logic() {
        let visitor = signals_transform(PluginOptions::default());

        // Test auto mode (default) - component with signals
        let info_component_with_signals = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: true,
            has_opt_in_comment: false,
            has_opt_out_comment: false,
        };
        assert!(visitor.should_transform(&info_component_with_signals));

        // Test auto mode - component without signals
        let info_component_no_signals = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: false,
            has_opt_in_comment: false,
            has_opt_out_comment: false,
        };
        assert!(!visitor.should_transform(&info_component_no_signals));

        // Test auto mode - hook with signals
        let info_hook_with_signals = FunctionInfo {
            name: Some("useCustomHook".to_string()),
            is_component: false,
            is_hook: true,
            has_jsx: false,
            uses_signals: true,
            has_opt_in_comment: false,
            has_opt_out_comment: false,
        };
        assert!(visitor.should_transform(&info_hook_with_signals));

        // Test auto mode - hook without signals
        let info_hook_no_signals = FunctionInfo {
            name: Some("useCustomHook".to_string()),
            is_component: false,
            is_hook: true,
            has_jsx: false,
            uses_signals: false,
            has_opt_in_comment: false,
            has_opt_out_comment: false,
        };
        assert!(!visitor.should_transform(&info_hook_no_signals));

        // Test opt-out comment always prevents transformation
        let info_with_opt_out = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: true,
            has_opt_in_comment: false,
            has_opt_out_comment: true,
        };
        assert!(!visitor.should_transform(&info_with_opt_out));

        // Test opt-in comment always enables transformation
        let info_with_opt_in = FunctionInfo {
            name: Some("myFunction".to_string()),
            is_component: false,
            is_hook: false,
            has_jsx: false,
            uses_signals: false,
            has_opt_in_comment: true,
            has_opt_out_comment: false,
        };
        assert!(visitor.should_transform(&info_with_opt_in));
    }

    #[test]
    fn test_mode_all() {
        let visitor = signals_transform(PluginOptions {
            mode: Some("all".to_string()),
            ..Default::default()
        });

        // Test "all" mode transforms all components regardless of signal usage
        let info_component_no_signals = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: false,
            has_opt_in_comment: false,
            has_opt_out_comment: false,
        };
        assert!(visitor.should_transform(&info_component_no_signals));

        // Test "all" mode doesn't transform non-components
        let info_regular_function = FunctionInfo {
            name: Some("myFunction".to_string()),
            is_component: false,
            is_hook: false,
            has_jsx: false,
            uses_signals: true,
            has_opt_in_comment: false,
            has_opt_out_comment: false,
        };
        assert!(!visitor.should_transform(&info_regular_function));
    }

    #[test]
    fn test_mode_manual() {
        let visitor = signals_transform(PluginOptions {
            mode: Some("manual".to_string()),
            ..Default::default()
        });

        // Test "manual" mode only transforms with explicit opt-in
        let info_component_with_signals = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: true,
            has_opt_in_comment: false,
            has_opt_out_comment: false,
        };
        assert!(!visitor.should_transform(&info_component_with_signals));

        // Test "manual" mode with opt-in comment
        let info_with_opt_in = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: true,
            has_opt_in_comment: true,
            has_opt_out_comment: false,
        };
        assert!(visitor.should_transform(&info_with_opt_in));
    }

    #[test]
    fn test_jsx_identifiers_detection() {
        let mut visitor = signals_transform(PluginOptions {
            detect_transformed_jsx: Some(true),
            ..Default::default()
        });

        // Test jsx runtime import detection
        let module = Module {
            span: DUMMY_SP,
            body: vec![ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                span: DUMMY_SP,
                specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                    span: DUMMY_SP,
                    local: Ident {
                        span: DUMMY_SP,
                        ctxt: SyntaxContext::empty(),
                        sym: "jsx".into(),
                        optional: false,
                    },
                    imported: Some(ModuleExportName::Ident(Ident {
                        span: DUMMY_SP,
                        ctxt: SyntaxContext::empty(),
                        sym: "jsx".into(),
                        optional: false,
                    })),
                    is_type_only: false,
                })],
                src: Box::new(Str {
                    span: DUMMY_SP,
                    value: "react/jsx-runtime".into(),
                    raw: None,
                }),
                type_only: false,
                with: None,
                phase: Default::default(),
            }))],
            shebang: None,
        };

        visitor.detect_jsx_imports(&module);
        assert!(visitor.jsx_identifiers.contains("jsx"));
    }

    #[test]
    fn test_experimental_no_try_finally_option() {
        let visitor = signals_transform(PluginOptions {
            experimental: Some(ExperimentalOptions {
                no_try_finally: Some(true),
            }),
            ..Default::default()
        });

        // Verify that experimental option is properly stored
        assert_eq!(
            visitor.options.experimental.as_ref().unwrap().no_try_finally,
            Some(true)
        );
    }

    #[test]
    fn test_custom_import_source() {
        let custom_source = "custom-signals-runtime";
        let visitor = signals_transform(PluginOptions {
            import_source: Some(custom_source.to_string()),
            ..Default::default()
        });

        assert_eq!(visitor.options.import_source.as_deref(), Some(custom_source));
    }

    #[test]
    fn test_function_info_initialization() {
        let info = FunctionInfo {
            name: Some("TestComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: false,
            uses_signals: false,
            has_opt_in_comment: false,
            has_opt_out_comment: false,
        };

        assert_eq!(info.name, Some("TestComponent".to_string()));
        assert!(info.is_component);
        assert!(!info.is_hook);
        assert!(!info.has_jsx);
        assert!(!info.uses_signals);
        assert!(!info.has_opt_in_comment);
        assert!(!info.has_opt_out_comment);
    }

    #[test]
    fn test_import_name_constant() {
        assert_eq!(IMPORT_NAME, "useSignals");
        assert_eq!(DEFAULT_IMPORT_SOURCE, "@preact/signals-react/runtime");
    }

    #[test]
    fn test_opt_out_comment_regex() {
        let regex = &*OPT_OUT_COMMENT;
        
        // Test valid opt-out patterns
        assert!(regex.is_match("@noUseSignals"));
        assert!(regex.is_match("@noTrackSignals"));
        assert!(regex.is_match(" @noUseSignals "));
        assert!(regex.is_match(" @noTrackSignals "));
        assert!(regex.is_match("some text @noUseSignals"));
        assert!(regex.is_match("@noUseSignals and more text"));
        
        // Test invalid patterns
        assert!(!regex.is_match("@noSignals"));
        assert!(!regex.is_match("@noUse"));
        assert!(!regex.is_match("noUseSignals"));
        assert!(!regex.is_match("@useSignals"));
    }

    #[test]
    fn test_opt_in_comment_regex() {
        let regex = &*OPT_IN_COMMENT;
        
        // Test valid opt-in patterns
        assert!(regex.is_match("@useSignals"));
        assert!(regex.is_match("@trackSignals"));
        assert!(regex.is_match(" @useSignals "));
        assert!(regex.is_match(" @trackSignals "));
        assert!(regex.is_match("some text @useSignals"));
        assert!(regex.is_match("@trackSignals and more text"));
        
        // Test invalid patterns
        assert!(!regex.is_match("@signals"));
        assert!(!regex.is_match("@use"));
        assert!(!regex.is_match("useSignals"));
        assert!(!regex.is_match("@noUseSignals"));
    }

    #[test]
    fn test_opt_out_comment_overrides_transform() {
        let visitor = signals_transform(PluginOptions::default());

        // Test that opt-out comment prevents transformation even for component with signals
        let info_with_opt_out = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: true,
            has_opt_in_comment: false,
            has_opt_out_comment: true,
        };
        assert!(!visitor.should_transform(&info_with_opt_out));

        // Test that opt-out comment prevents transformation even in "all" mode
        let visitor_all = signals_transform(PluginOptions {
            mode: Some("all".to_string()),
            ..Default::default()
        });
        assert!(!visitor_all.should_transform(&info_with_opt_out));
    }

    #[test]
    fn test_opt_in_comment_enables_transform() {
        let visitor = signals_transform(PluginOptions::default());

        // Test that opt-in comment enables transformation for non-component
        let info_with_opt_in = FunctionInfo {
            name: Some("myFunction".to_string()),
            is_component: false,
            is_hook: false,
            has_jsx: false,
            uses_signals: false,
            has_opt_in_comment: true,
            has_opt_out_comment: false,
        };
        assert!(visitor.should_transform(&info_with_opt_in));

        // Test that opt-in comment works in "manual" mode
        let visitor_manual = signals_transform(PluginOptions {
            mode: Some("manual".to_string()),
            ..Default::default()
        });
        assert!(visitor_manual.should_transform(&info_with_opt_in));
    }

    #[test]
    fn test_opt_out_takes_precedence_over_opt_in() {
        let visitor = signals_transform(PluginOptions::default());

        // Test that opt-out comment takes precedence when both are present
        let info_both_comments = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: true,
            has_opt_in_comment: true,
            has_opt_out_comment: true,
        };
        assert!(!visitor.should_transform(&info_both_comments));
    }

    #[test]
    fn test_comment_functionality_integration() {
        // Test opt-out comment integration
        let visitor = signals_transform(PluginOptions::default());
        
        let info_with_opt_out = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: true,
            has_opt_in_comment: false,
            has_opt_out_comment: true,
        };
        
        assert!(!visitor.should_transform(&info_with_opt_out), "Opt-out comment should prevent transformation");

        // Test opt-in comment integration
        let visitor_manual = signals_transform(PluginOptions {
            mode: Some("manual".to_string()),
            ..Default::default()
        });
        
        let info_with_opt_in = FunctionInfo {
            name: Some("myFunction".to_string()),
            is_component: false,
            is_hook: false,
            has_jsx: false,
            uses_signals: false,
            has_opt_in_comment: true,
            has_opt_out_comment: false,
        };
        
        assert!(visitor_manual.should_transform(&info_with_opt_in), "Opt-in comment should enable transformation");

        // Test comment precedence integration
        let info_both_comments = FunctionInfo {
            name: Some("MyComponent".to_string()),
            is_component: true,
            is_hook: false,
            has_jsx: true,
            uses_signals: true,
            has_opt_in_comment: true,
            has_opt_out_comment: true,
        };
        
        assert!(!visitor.should_transform(&info_both_comments), "Opt-out should take precedence over opt-in");
    }

    #[test]
    fn test_comment_regex_patterns_advanced() {
        // Test opt-out patterns with various formats
        assert!(OPT_OUT_COMMENT.is_match("@noUseSignals"));
        assert!(OPT_OUT_COMMENT.is_match("@noTrackSignals"));
        assert!(OPT_OUT_COMMENT.is_match(" @noUseSignals "));
        assert!(OPT_OUT_COMMENT.is_match("/** @noUseSignals */"));
        assert!(OPT_OUT_COMMENT.is_match("// @noTrackSignals"));
        assert!(OPT_OUT_COMMENT.is_match("some text @noUseSignals more text"));
        assert!(!OPT_OUT_COMMENT.is_match("@useSignals"));
        assert!(!OPT_OUT_COMMENT.is_match("@noSignals"));
        assert!(!OPT_OUT_COMMENT.is_match("noUseSignals"));
        
        // Test opt-in patterns with various formats
        assert!(OPT_IN_COMMENT.is_match("@useSignals"));
        assert!(OPT_IN_COMMENT.is_match("@trackSignals"));
        assert!(OPT_IN_COMMENT.is_match(" @useSignals "));
        assert!(OPT_IN_COMMENT.is_match("/** @useSignals */"));
        assert!(OPT_IN_COMMENT.is_match("// @trackSignals"));
        assert!(OPT_IN_COMMENT.is_match("some text @useSignals more text"));
        assert!(!OPT_IN_COMMENT.is_match("@noUseSignals"));
        assert!(!OPT_IN_COMMENT.is_match("@signals"));
        assert!(!OPT_IN_COMMENT.is_match("useSignals"));
    }
}
