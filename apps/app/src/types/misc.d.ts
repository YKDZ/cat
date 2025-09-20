declare global {
  type WithRequired<T, K extends keyof T> = Required<Pick<T, K>> & Omit<T, K>;
  type FirstChar =
    | "A"
    | "B"
    | "C"
    | "D"
    | "E"
    | "F"
    | "G"
    | "H"
    | "I"
    | "J"
    | "K"
    | "L"
    | "M"
    | "N"
    | "O"
    | "P"
    | "Q"
    | "R"
    | "S"
    | "T"
    | "U"
    | "V"
    | "W"
    | "X"
    | "Y"
    | "Z";

  type CapitalizedKeys<T> = {
    [K in Extract<keyof T, string>]: K extends `${FirstChar}${string}`
      ? K
      : never;
  }[Extract<keyof T, string>];
}

export {};
