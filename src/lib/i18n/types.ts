// A message is either a plain template string (with optional {param}
// placeholders) or a plural pair selected by the `count` param.
export type Message = string | { one: string; other: string };
export type Dict = Record<string, Message>;
