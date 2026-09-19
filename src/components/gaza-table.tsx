import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared semantic table vocabulary for public, operational, and embedded data. */
export const GazaTable = React.forwardRef<
  HTMLTableElement,
  React.TableHTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <table
    ref={ref}
    className={cn("w-full border-collapse text-sm text-start", className)}
    {...props}
  />
));
GazaTable.displayName = "GazaTable";

export const GazaTableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-sand/75 text-muted-foreground [&_tr]:border-b [&_tr]:border-border",
      className,
    )}
    {...props}
  />
));
GazaTableHeader.displayName = "GazaTableHeader";

export const GazaTableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-b-0", className)} {...props} />
));
GazaTableBody.displayName = "GazaTableBody";

export const GazaTableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-border transition-colors duration-150 motion-reduce:transition-none",
      "hover:bg-sand/55 data-[state=selected]:bg-brand-soft/70",
      className,
    )}
    {...props}
  />
));
GazaTableRow.displayName = "GazaTableRow";

export const GazaTableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, scope = "col", ...props }, ref) => (
  <th
    ref={ref}
    scope={scope}
    className={cn(
      "h-10 px-3 py-2 text-start align-middle text-xs font-bold text-muted-foreground",
      className,
    )}
    {...props}
  />
));
GazaTableHead.displayName = "GazaTableHead";

export const GazaTableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn("px-3 py-2.5 align-middle", className)} {...props} />
));
GazaTableCell.displayName = "GazaTableCell";

export const GazaTableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("sr-only", className)} {...props} />
));
GazaTableCaption.displayName = "GazaTableCaption";
