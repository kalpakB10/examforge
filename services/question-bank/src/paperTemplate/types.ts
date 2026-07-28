// Structured layout schema for paper templates.
// Header + footer are each a list of rows; each row has left/center/right slots;
// each slot holds one or more field references.

export type FieldType =
  | "text"                // custom static text
  | "orgName"             // pulled from paperConfig.org.orgName
  | "orgAddress"
  | "orgLogo"             // logoText box
  | "examTitle"
  | "paperTitle"          // "Question Paper" / "Answer Key"
  | "date"
  | "time"                // total time minutes
  | "totalMarks"
  | "totalQuestions"
  | "setNumber"           // A/B/C/D variant label
  | "rollNumberBox"       // pre-styled box "Roll No: ___ Name: ___"
  | "signatureBox"        // pre-styled box "Teacher Sign: ___"
  | "instructionsBlock"   // renders full instructions
  | "pageNumber"          // footer only
  | "chapterName"         // footer — comma-joined section subject/chapter labels
  | "subjectName"
  | "timestamp"           // footer generation time
  | "customFooter";       // teacher-editable footer text (paperConfig.footerText)

export type Align = "left" | "center" | "right";

export interface Field {
  type: FieldType;
  text?: string;                       // required when type === "text"
  size?: "sm" | "md" | "lg" | "xl";    // font size hint
  bold?: boolean;
  italic?: boolean;
  color?: string;                      // css color
  bg?: string;                         // background color
  border?: boolean;                    // draw a border box around it
  padding?: string;                    // css padding
  uppercase?: boolean;
}

export interface Slot {
  align: Align;
  fields: Field[];
  gap?: string;                        // space between fields, default "6px"
}

export interface Row {
  slots: Slot[];                       // usually 1, 2, or 3 slots
  divider?: boolean;                   // draw a horizontal line after this row
  bg?: string;                         // row background
  padding?: string;
  border?: boolean;                    // wrap whole row in a border box
}

export interface Section {
  rows: Row[];
}

export interface Layout {
  paperSize?: "A4" | "Letter";
  margins?: { top?: string; bottom?: string; left?: string; right?: string };
  fontFamily?: string;
  fontSize?: string;
  accentColor?: string;                // color used for section banners, borders

  header: Section;
  footer?: Section;

  // Meta row shown just before the questions — configurable field list
  metaRow?: {
    show: boolean;
    fields: Array<"date" | "time" | "totalMarks" | "totalQuestions">;
  };

  // Answer key gets a different accent to distinguish visually but keeps same layout
  answerKeyAccentColor?: string;
}
