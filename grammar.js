/**
 * @file Lang0 grammar for tree-sitter
 * @author Martin Feineis <mfeineis@users.noreply.github.com>
 * @license UPL
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "lang0",

  // See https://github.com/elm-tooling/tree-sitter-elm/blob/main/grammar.js#L33
  extras: $ => [
    $.comment,
    /[\s\uFEFF\u2060\u200B]|\\\r?\n/,
  ],

  word: $ => $.identifier,

  rules: {
    source_file: $ => seq(
      optional($.toplevel_docs),
      choice(
        $.app_declaration,
        $.module_declaration,
      ),
      optional($._declarations),
    ),

    comment: $ => token(seq('#', repeat(/[^\n]/))),

    toplevel_docs: $ => $.multiline_string_literal,

    ignored_type_annotation: $ => seq($.identifier, token(seq(":", /[^\n]*/))),

    app_declaration: $ => seq(
      $.app,
      $.with,
      $.record_expression,
      optional($.module_imports),
    ),

    module_declaration: $ => seq(
      $.module,
      optional(seq(
        $.as,
        $.module_name_definition,
      )),
      optional($.module_export_list),
      optional($.module_imports),
    ),

    module_export_list: $ => seq(
      "|",
      sep1("|", $.identifier),
    ),

    module_imports: $ => repeat1($.import_clause),

    import_clause: $ => seq(
      $.import,
      $.module_import_name,
      // There are no side-effect modules so import qualified
      // and/or import types from the module
      choice(
        $.import_expose_list,
        seq(
          $._import_qualified,
          $.import_expose_list,
        ),
        $._import_qualified,
      ),
    ),

    _import_qualified: $ => seq($.as, field("qualified", $.identifier)),

    import_expose_list: $ => seq(
      "|",
      sep1("|", $.import_expose_item),
    ),

    import_expose_item: $ => alias($.uppercase_identifier, "import_expose_item"),

    _declarations: $ => repeat1(
      choice(
        $.ignored_type_annotation,
        $.function_declaration,
        $.let_expression,
        $.toplevel_docs,
        // $._function_declaration_with_type,
        // $._toplevel_let_binding_with_type,
      ),
    ),

    // _function_declaration_with_type: $ => seq(
    //   // optional($.type_annotation),
    //   $.function_declaration,
    // ),

    // _toplevel_let_binding_with_type: $ => seq(
    //   // optional($.type_annotation),
    //   // optional($.ignored_type_annotation),
    //   $.let_expression,
    // ),

    function_declaration: $ => seq(
      $.function,
      field("name", $.identifier),
      repeat($.function_param),
      $.eq, // TODO: Do we actually want the "=" for function declarations?
      field("body", $._expression),
    ),

    function_param: $ => choice(
      $.record_pattern,
      $.identifier,
    ),

    record_pattern: $ => seq(
      "{",
      sep1(",", $.simple_record_key),
      "}",
    ),

    sequence_pattern: $ => seq(
      "[",
      sep1(",", $.identifier),
      optional(seq(",", $.rest_args)),
      "]",
    ),

    _expression: $ => choice(
      $.let_expression,
      $.lambda_expression,
      $.when_expression,
      $._atom,
    ),

    _atom: $ => choice(
      $._atom_in_parens,
      $._atom_not_in_parens
    ),

    // TODO: Do we actually need the parens in the AST? Might be useful for editors
    _atom_in_parens: $ => seq(
      $.parenL,
      $._atom_not_in_parens,
      $.parenR,
    ),

    _atom_not_in_parens: $ => choice(
      $.value_expression,
      $.int_literal,
      $.record_expression,
      $.sequence_expression,
      $.string_literal,
      $.call_expression,
    ),

    value_expression: $ => choice(
      $.identifier,
    ),

    let_expression: $ => seq(
      $.let,
      choice(
        $.record_pattern,
        $.sequence_pattern,
        $.identifier,
      ),
      $.eq,
      field("body", $._expression),
    ),

    lambda_expression: $ => seq(
      "{",
      optional(seq(
        sep1(",", $.function_param),
        $.arrow,
      )),
      repeat($.let_expression),
      $._expression,
      "}",
    ),

    record_expression: $ => seq(
      "{",
      sep1(",", $.record_expression_entry),
      "}",
    ),

    record_expression_entry: $ => seq(
      field("key", $.simple_record_key),
      $.eq,
      field("value", $._atom),
    ),

    sequence_expression: $ => seq(
      "[",
      sep1(",", $.sequence_expression_entry),
      "]",
    ),

    sequence_expression_entry: $ => choice(
      $._atom,
      $.sequence_expression_splat,
    ),

    conditional_expression: $ => seq(
      field("left", $._atom),
      $.eqeq,
      field("right", $._atom),
    ),

    when_expression: $ => seq(
      $.when,
      field("subject", $._atom),
      $.is,
      "|",
      sep1("|", $.when_branch),
    ),

    when_branch: $ => seq(
      $.when_branch_pattern,
      optional(seq(
        $.where,
        $.when_branch_pattern_guard,
      )),
      $.arrow,
      $.when_branch_consequence,
    ),

    when_branch_pattern: $ => choice(
      $.else,
      $.record_pattern,
      $.sequence_pattern,
      $.string_literal,
      $.int_literal,
    ),

    when_branch_pattern_guard: $ => choice(
      $.conditional_expression,
    ),

    when_branch_consequence: $ => choice(
      $._atom,
    ),

    // TODO: Not sure whether call expressions should actually be right associative a.k.a. selecting the rule that ends later
    call_expression: $ => prec.right(
      seq(
        $.call_target,
        repeat1($.call_param),
      ),
    ),

    call_target: $ => choice(
      $.qualified_accessor,
      prec(1, $.identifier),
    ),

    call_param: $ => choice(
      $._atom,
    ),

    app: $ => "app",
    with: $ => "with",
    module: $ => "module",
    as: $ => "as",
    import: $ => "import",
    function: $ => "function",
    let: $ => "let",
    dot: $ => ".",
    dotdotdot: $ => "...",
    eq: $ => "=",
    eqeq: $ => "==",
    when: $ => "when",
    is: $ => "is",
    where: $ => "where",
    else: $ => "else",
    arrow: $ => "->",
    parenL: $ => "(",
    parenR: $ => ")",
    pathSep: $ => "/",
    versionAt: $ => "@",
    // colon: $ => ":",

    // Module name definitions are very simple file paths
    module_name_definition: $ => seq(
      '"',
      sep1($.pathSep, $.module_name_path_fragment),
      '"',
    ),

    // Module imports can contain version information so
    module_import_name: $ => seq(
      '"',
      sep1($.pathSep, $.module_name_path_fragment),
      optional(seq($.versionAt, $.module_version)),
      '"',
    ),

    module_version: $ => choice(
      field("name", /[-a-z]+/),
      field("version", /\d+(?:\.\d+){0,2}(?:\-[a-zA-Z][a-zA-Z0-9]*)?/),
    ),

    identifier: $ => /[_a-z][_a-zA-Z0-9]*/,

    qualified_accessor: $ => seq(
      $.identifier,
      $.dot,
      $.identifier,
    ),

    module_name_path_fragment: $ => /[a-z][a-z0-9]*/,

    // FIXME: Had to declare precedence to disambiguate, probably because of the
    //        regex match being exactly the same and the parser not being able
    //        to choose although it should be able to do so in this context...
    // function x =
    //   { { x, y, z } -> x }
    //        ^-- (function_param identifier) X (simple_record_key identifier)
    simple_record_key: $ => prec(1, alias($.identifier, "simple_record_key")),
    // simple_record_key: $ => /[_a-z][_a-zA-Z0-9]*/,

    uppercase_identifier: $ => /[A-Z][a-zA-Z0-9]*/,

    int_literal: $ => token(/0|-?[1-9][_\d]*/),

    // See https://github.com/tree-sitter/tree-sitter-haskell/blob/master/grammar/literal.js#L36
    string_literal: $ => seq(
      '"',
      repeat(choice(
        /[^\\"\n]/,
        /\\(\^)?./,
        /\\\n\s*\\/,
      )),
      '"',
    ),

    multiline_string_literal: $ => seq(
      alias('"""', $.open_quote),
      repeat(
        choice(
          alias(
            token.immediate(
              repeat1(choice(/[^\\"]/, /"[^"]/, /""[^"]/))
            ),
            $.regular_string_part
          ),
          $.string_escape,
          $.invalid_string_escape
        )
      ),
      alias('"""', $.close_quote)
    ),

    // FIXME: We want "simple" utf-8 in the end so this string escape needs to be adjusted, Elm supports something different
    // See https://github.com/elm-tooling/tree-sitter-elm/blob/main/grammar.js#L699
    string_escape: $ => /\\(u\{[0-9A-Fa-f]{4,6}\}|[nrt\"'\\])/,
    invalid_string_escape: $ => /\\(u\{[^}]*\}|[^nrt\"'\\])/,

    rest_args: $ => seq($.dotdotdot, $.rest_args_identifier),
    
    rest_args_identifier: $ => token.immediate(/[_a-z][_a-zA-Z0-9]*/),

    sequence_expression_splat: $ => seq($.dotdotdot, $.sequence_expression_splat_identifier),

    sequence_expression_splat_identifier: $ => token.immediate(/[_a-z][_a-zA-Z0-9]*/),
  }
});

function sep1(separator, rule) {
  return seq(rule, repeat(seq(separator, rule)));
}
