import { Badge, Button, Card, Paper, Table, Tooltip, createTheme, type MantineColorsTuple } from "@mantine/core";

const brand: MantineColorsTuple = ["#eef3ff", "#dce4f9", "#b6c6f0", "#8ea7e7", "#6b8cdf", "#5579da", "#486fd8", "#3a5ec0", "#3053ac", "#234899"];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: { light: 7, dark: 5 },
  colors: { brand },
  fontFamily: "var(--font-sans), system-ui, -apple-system, Segoe UI, sans-serif",
  fontFamilyMonospace: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
  headings: { fontFamily: "var(--font-sans), system-ui, sans-serif", fontWeight: "650" },
  defaultRadius: "md",
  cursorType: "pointer",
  components: {
    Paper: Paper.extend({ defaultProps: { withBorder: true, radius: "md" } }),
    Card: Card.extend({ defaultProps: { withBorder: true, radius: "md", padding: "lg" } }),
    Button: Button.extend({ defaultProps: { radius: "md" } }),
    Badge: Badge.extend({ defaultProps: { radius: "sm", variant: "light" } }),
    Tooltip: Tooltip.extend({ defaultProps: { openDelay: 300, withArrow: true } }),
    Table: Table.extend({ defaultProps: { verticalSpacing: "sm", highlightOnHover: true } }),
  },
});
