use std::sync::Arc;

use serde::Deserialize;
use swc_core::{
    common::{SourceMapper, DUMMY_SP},
    ecma::{
        ast::*,
        visit::{noop_visit_mut_type, visit_mut_pass, VisitMut, VisitMutWith},
    },
    plugin::{
        metadata::TransformPluginMetadataContextKind,
        plugin_transform,
        proxies::{PluginSourceMapProxy, TransformPluginProgramMetadata},
    },
};

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct PluginOptions {
    enabled: Option<bool>,
}

impl PluginOptions {
    fn is_enabled(&self) -> bool {
        self.enabled.unwrap_or(true)
    }
}

struct SignalNameVisitor {
    current_var_name: Option<String>,
    file_name: Option<String>,
    source_map: Arc<PluginSourceMapProxy>,
}

impl VisitMut for SignalNameVisitor {
    noop_visit_mut_type!();

    fn visit_mut_call_expr(&mut self, call_expr: &mut CallExpr) {
        call_expr.visit_mut_children_with(self);

        let Some(variable_name) = self.current_var_name.as_deref() else {
            return;
        };

        if !is_signal_call(call_expr) || has_name_in_options(call_expr) {
            return;
        }

        let line_number = self.source_map.lookup_char_pos(call_expr.span.lo).line;
        inject_signal_name(
            call_expr,
            variable_name,
            self.file_name.as_deref(),
            line_number,
        );
    }

    fn visit_mut_var_declarator(&mut self, var_declarator: &mut VarDeclarator) {
        let previous_var_name = self.current_var_name.take();
        self.current_var_name = match &var_declarator.name {
            Pat::Ident(binding_ident) => Some(binding_ident.id.sym.to_string()),
            _ => None,
        };

        if let Some(init) = &mut var_declarator.init {
            init.visit_mut_with(self);
        }

        self.current_var_name = previous_var_name;
    }
}

#[plugin_transform]
pub fn signals_preact_transform_swc(
    mut program: Program,
    metadata: TransformPluginProgramMetadata,
) -> Program {
    let options = metadata
        .get_transform_plugin_config()
        .and_then(|config| serde_json::from_str::<PluginOptions>(&config).ok())
        .unwrap_or_default();

    if !options.is_enabled() {
        return program;
    }

    let file_name = metadata
        .get_context(&TransformPluginMetadataContextKind::Filename)
        .and_then(|filename| basename(&filename).map(str::to_owned));

    program.mutate(visit_mut_pass(SignalNameVisitor {
        current_var_name: None,
        file_name,
        source_map: Arc::new(metadata.source_map),
    }));

    program
}

fn basename(filename: &str) -> Option<&str> {
    filename
        .split(['/', '\\'])
        .filter(|segment| !segment.is_empty())
        .last()
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
                _ => false,
            },
            _ => false,
        },
        PropOrSpread::Spread(_) => false,
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
