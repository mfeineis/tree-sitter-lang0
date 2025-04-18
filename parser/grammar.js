/**
 * @file Canapea grammar for tree-sitter
 * @author Martin Feineis
 * @license UPL-1.0
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "canapea",

  // See https://github.com/elm-tooling/tree-sitter-elm/blob/main/grammar.js#L33
  extras: $ => [
    $.comment,
    /[\s\uFEFF\u2060\u200B]|\\\r?\n/,
  ],

  // Order is significant(!) for custom src/scanner.c:TokenType
  externals: $ => [
    $.implicit_block_open,
    $.implicit_block_close,
    $.is_in_error_recovery, // Unused in grammar, just convenience for scanner
  ],

  // externals: $ => [$.if_keyword],
  // then using it in a rule like so:
  //if_statement: $ => seq(alias($.if_keyword, 'if'), ...),

  // word: $ => $.identifier, //_keyword_extraction,

  rules: {
    source_file: $ => seq(
      optional($.toplevel_docs),
      choice(
        $.app_declaration,
        $.module_declaration,
      ),
      optional($._toplevel_declarations),
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

    module_export_list: $ => prec.left(
      seq(
        "|",
        choice(
          sep1("|", $.module_export_type),
          sep1("|", $.module_export_function),
          seq(
            sep1("|", $.module_export_type),
            "|",
            sep1("|", $.module_export_function),
          ),
        ),
      ),
    ),

    module_export_type: $ => seq(
      field("type", $.custom_type_constructor_name),
      optional(
        seq(
          "(",
          sep1(
            ",",
            field("constructor", $.custom_type_constructor_name),
          ),
          ")",
        ),
      ),
    ),

    module_export_function: $ => alias(
      $.identifier,
      "module_export_function",
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
      sep1("|", $.import_expose_type),
    ),

    import_expose_type: $ => seq(
      choice(
        field("type", $.custom_type_constructor_name),
        seq(
          field("type", $.custom_type_constructor_name),
          $.as,
          field("exposed_as", $.custom_type_constructor_name),
        ),
      ),
      optional(
        seq(
          "(",
          sep1(",", $.import_expose_type_constructor),
          ")",
        ),
      ),
    ),

    import_expose_type_constructor: $ => seq(
      field("constructor", $.custom_type_constructor_name),
      optional(
        seq(
          $.as,
          field("exposed_as", $.custom_type_constructor_name),
        ),
      ),
    ),

    _toplevel_declarations: $ => repeat1(
      choice(
        $.function_declaration,
        $.let_expression,
        $.toplevel_docs,
        $.custom_type_declaration,
        $.record_declaration,
        // $._function_declaration_with_type,
        // $._toplevel_let_binding_with_type,
      ),
    ),

    // TODO: We're keeping ourselves open to introduce explicit blocks, if we really need to
    _implicit_block_open: $ => alias($.implicit_block_open, "_implicit_block_open"),
    _implicit_block_close: $ => alias($.implicit_block_close, "_implicit_block_close"),

    function_declaration: $ => seq(
      optional($.ignored_type_annotation),
      $.function,
      field("name", $.identifier),
      repeat1($.function_parameter),
      $.eq, // TODO: Do we actually want the "=" for function declarations?
      $.implicit_block_open,
      $._block_body,
      $.implicit_block_close,
    ),

    function_parameter: $ => prec(
      1,
      choice(
        $.dont_care,
        $.record_pattern,
        $.sequence_pattern,
        seq("(", $.custom_type_pattern, ")"),
        $.identifier,
      ),
    ),

    // A couple of local bindings, the last expression is the return value
    _block_body: $ => choice(
      seq(
        field("binding", repeat1($.let_expression)),
        field("return", $._call_or_atom),
      ),
      field("single_return", $._call_or_atom),
    ),

    record_pattern: $ => seq(
      "{",
      sep1(",", $.simple_record_key),
      "}",
    ),

    sequence_pattern: $ => prec(
      1,
      seq(
        "[",
        sep1(",",
          choice(
            $.dont_care,
            $._literal_expression,
            $.record_pattern,
            $.custom_type_pattern,
            $.identifier,
          ),
        ),
        optional(seq(",", $.rest_args)),
        "]",
      ),
    ),

    custom_type_pattern: $ => prec(
      1,
      choice(
        $.custom_type_trivial_value_expression,
        $._complex_custom_type_pattern,
      ),
    ),

    _complex_custom_type_pattern: $ => prec.right(
      seq(
        $.custom_type_constructor_name,
        repeat(
          choice(
            $.sequence_pattern,
            $.record_pattern,
            $.identifier,
            $.custom_type_pattern,
            seq("(", $.custom_type_pattern, ")"),
          ),
        ),
      ),
    ),

    _call_or_atom: $ => choice(
      seq($.parenL, $.call_expression, $.parenR),
      $.call_expression,
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
      $.anonymous_function_expression,
      $.when_expression,
      $.operator_expression,
      $.value_expression,
      $.record_expression,
      $.sequence_expression,
      $._literal_expression,
      $.custom_type_trivial_value_expression,
    ),

    _literal_expression: $ => choice(
      $.string_literal,
      $.int_literal,
    ),

    // TODO: Pulling back operator precedence seems to work for (|>), no idea what to do about other operators
    operator_expression: $ => prec(
      0,
      prec.left(
        seq(
          $._call_or_atom,
          $.operator,
          $._call_or_atom,
        ),
      ),
    ),

    operator: $ => $.operator_identifier,

    value_expression: $ => choice(
      $.qualified_access_expression,
      $.identifier,
    ),

    let_expression: $ => seq(
      optional($.ignored_type_annotation),
      $.let,
      choice(
        $.record_pattern,
        $.sequence_pattern,
        $.identifier,
      ),
      $.eq,
      $.implicit_block_open,
      $._block_body,
      $.implicit_block_close,
    ),

    anonymous_function_expression: $ => seq(
      "{",
      optional(
        seq(
          repeat1($.function_parameter),
          $.arrow,
        ),
      ),
      $._block_body,
      "}",
    ),

    // Record splats are only allowed as the first entry
    record_expression: $ => seq(
      "{",
      optional(seq(
        $.record_expression_splat,
        ",",
      )),
      sep1(",", $.record_expression_entry),
      "}",
    ),

    record_expression_entry: $ => seq(
      field("key", $.simple_record_key),
      $.eq,
      field("value", $._call_or_atom),
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
      field("left", $._call_or_atom),
      $.eqeq,
      field("right", $._call_or_atom),
    ),

    // When matches as many branches as it can
    when_expression: $ => prec.right(
      seq(
        $.when,
        field("subject", $._call_or_atom),
        $.is,
        repeat(seq("|", $.when_branch)),
        optional(seq("|", $.when_branch_catchall)),
      ),
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

    when_branch_catchall: $ => seq(
      $.else,
      $.arrow,
      $.when_branch_consequence,
    ),

    when_branch_pattern: $ => choice(
      $.record_pattern,
      $.sequence_pattern,
      $._literal_expression,
      $.custom_type_pattern,
    ),

    when_branch_pattern_guard: $ => choice(
      $.conditional_expression,
    ),

    when_branch_consequence: $ => prec(
      1,
      choice(
        seq(
          $.implicit_block_open,
          $._call_or_atom,
          $.implicit_block_close,
        ),
      ),
    ),

    // FIXME: Call expressions need to capture anonymous functions as last parameter
    call_expression: $ => prec.right(
      0,
      seq(
        $.call_target,
        repeat1($.call_parameter),
      ),
    ),

    call_target: $ => prec(
      2,
      choice(
        $.value_expression,
        $.custom_type_trivial_value_expression,
      ),
    ),

    call_parameter: $ => prec(
      3,
      choice(
        $.value_expression,
        $._call_or_atom,
      ),
    ),

    custom_type_declaration: $ => seq(
      $.type,
      field("name", $.custom_type_constructor_name),
      repeat($.type_variable),
      $.eq,
      // optional("|"), // TODO: Make first custom type "|" optional?
      "|",
      sep1("|", $.custom_type_constructor),
    ),

    custom_type_constructor: $ => seq(
      $._implicit_block_open,
      field("name", $.custom_type_constructor_name),
      repeat(
        choice(
          $.uppercase_identifier,
          $.type_variable,
          $.record_type_expression,
          seq("(", repeat1($.custom_type_expression), ")"),
        ),
      ),
      optional($._implicit_block_close),
    ),

    custom_type_expression: $ => prec.right(
      seq(
        field("name", $.uppercase_identifier),
        repeat(
          choice(
            $.uppercase_identifier,
            $.type_variable,
            $.record_type_expression,
            seq("(", repeat1($.custom_type_expression), ")"),
          ),
        ),
      ),
    ),

    custom_type_trivial_value_expression: $ => alias(
      $.uppercase_identifier,
      "custom_type_trivial_value_expression",
    ),

    record_declaration: $ => seq(
      $.record,
      field("name", $.uppercase_identifier),
      $.eq,
      $.record_type_expression,
    ),

    record_type_expression: $ => seq(
      "{",
      sep1(",", $.record_type_entry),
      "}",
    ),

    record_type_entry: $ => seq(
      // TODO: Do we really want complex record keys?
      // choice($.simple_record_key, $.complex_record_key),
      $.simple_record_key,
      $.colon,
      $.custom_type_constructor,
    ),

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

    qualified_access_expression: $ => prec.left(
      seq(
        field("target", $._field_access_target),
        // repeat1($._field_access_segment),
        // TODO: Do we actually want to enable "train wreck" a.b.c.d.e accessors?
        $._field_access_segment,
      ),
    ),

    _field_access_target: $ => prec(1, $.identifier),

    _field_access_segment: $ => prec.left(
      seq(
        alias($._dot_without_leading_whitespace, $.dot),
        field(
          "segment",
          alias($._identifier_without_leading_whitespace, $.identifier),
        ),
      ),
    ),

    //
    // Strings
    //

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

    //
    // Terminals
    //

    app: $ => "app",
    with: $ => "with",
    module: $ => "module",
    as: $ => "as",
    import: $ => "import",
    function: $ => "function",
    type: $ => "type",
    record: $ => "record",
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
    parenL: $ => token(prec(1, "(")),
    parenR: $ => ")",
    pathSep: $ => "/",
    versionAt: $ => "@",
    colon: $ => ":",

    operator_identifier: $ => "|>",

    module_name_path_fragment: $ => token(prec(0, /[a-z][a-z0-9]*/)),

    // FIXME: Had to declare precedence to disambiguate, probably because of the
    //        regex match being exactly the same and the parser not being able
    //        to choose although it should be able to do so in this context...
    // function x =
    //   { { x, y, z } -> x }
    //        ^-- (function_parameter identifier) X (simple_record_key identifier)
    simple_record_key: $ => prec(1, alias($.identifier, "simple_record_key")),
    // simple_record_key: $ => /[_a-z][_a-zA-Z0-9]*/,
    // complex_record_key: $ => token(prec(0, /"[^"]+"/)),

    int_literal: $ => token(prec(0, /0|-?[1-9][_\d]*/)),

    // FIXME: We want "simple" utf-8 in the end so this string escape needs to be adjusted, Elm supports something different
    // See https://github.com/elm-tooling/tree-sitter-elm/blob/main/grammar.js#L699
    string_escape: $ => token(prec(0, /\\(u\{[0-9A-Fa-f]{4,6}\}|[nrt\"'\\])/)),
    invalid_string_escape: $ => token(prec(0, /\\(u\{[^}]*\}|[^nrt\"'\\])/)),

    // FIXME: All the rest args and splats only support simple identifiers right now!
    rest_args: $ => seq($.dotdotdot, $.rest_args_identifier),
    rest_args_identifier: $ => token.immediate(/[_a-z][_a-zA-Z0-9]*/),

    sequence_expression_splat: $ => seq($.dotdotdot, $.sequence_expression_splat_identifier),
    sequence_expression_splat_identifier: $ => token.immediate(/[_a-z][_a-zA-Z0-9]*/),

    record_expression_splat: $ => seq($.dotdotdot, $.record_expression_splat_identifier),
    record_expression_splat_identifier: $ => token.immediate(/[_a-z][_a-zA-Z0-9]*/),

    // TODO: Clean up all the identifier mess including other terminal nodes
    // identifier_keyword_extraction: $ => /[_a-zA-Z]([a-zA-Z0-9]+)?/,
    identifier: $ => token(prec(0, /_[a-zA-Z0-9]([a-zA-Z0-9]+)?|[a-z]([a-zA-Z0-9]+)?/)),

    // token(prec(x, ...)) gives the token lexical precedence instead of parse precedence
    uppercase_identifier: $ => token(prec(1, /[A-Z][a-zA-Z0-9]*/)),
    custom_type_constructor_name: $ => token(prec(2, /[A-Z][a-zA-Z0-9]*/)),

    lowercase_identifier: $ => token(prec(1, /[a-z][a-zA-Z0-9]*/)),

    dont_care: $ => token(prec(0, "_")),

    _identifier_without_leading_whitespace: $ => token.immediate(/[_a-z][_a-zA-Z0-9]*/),
    _dot_without_leading_whitespace: $ => token.immediate("."),

    type_variable: $ => alias($.lowercase_identifier, "type_variable"),
  }
});

function sep1(separator, rule) {
  return seq(rule, repeat(seq(separator, rule)));
}
