# Workflow Admin Design System

## 0. Research Log

- Existing UI inspection: reused Element Plus form/dialog/table primitives and the existing card-settings grid; no external brand reference was supplied.

## 1. Atmosphere & Identity

An operational admin console: compact, calm, and information-dense without feeling cramped. The signature is consistent form rhythm—top-aligned labels, restrained borders, and clear full-width editing surfaces for CSS and rule tables.

## 2. Color

| Role | Token | Value | Usage |
|---|---|---|---|
| Surface | `--ds-surface` | `#ffffff` | Dialog and editor surfaces |
| Text primary | `--ds-text-primary` | `#303133` | Labels and values |
| Text secondary | `--ds-text-secondary` | `#606266` | Hints and summaries |
| Text muted | `--ds-text-muted` | `#909399` | Empty states |
| Border | `--ds-border` | `#dcdfe6` | Inputs and tables |
| Accent | `--ds-accent` | `#409eff` | Primary actions and focus |
| Danger | `--ds-danger` | `#f56c6c` | Delete actions and invalid states |

## 3. Typography

- Primary: system UI stack already used by the application.
- Body: 14px / 1.5.
- Caption and hints: 12px / 1.4.
- Labels: 14px / 1.4, medium weight.

## 4. Spacing & Layout

- Base unit: 4px.
- Dialog content gap: 16px.
- Form item gap: 16px.
- Configuration grids use 24 equal columns.
- Top-aligned labels are mandatory for style editors.
- CSS scripts, base classes, condition tables, and action lists span all 24 columns.
- Only semantically related short controls share a row: role/value type and alignment/show-label.

## 5. Components

### StyleScriptInput
- **Structure**: textarea with a trailing edit-icon button and a modal editor.
- **Variants**: base script and conditional script.
- **Spacing**: full-width, 16px form gap.
- **States**: empty, populated, focused, modal-open, disabled.
- **Accessibility**: labeled textarea; edit button has an accessible label and keyboard focus.
- **Motion**: Element Plus dialog transition only.
- **Layout**: full-width stack.

### StyleRuleTable
- **Structure**: compact bordered table with enabled switch, expression input, script input, class input, delete action.
- **Variants**: card scope and field scope.
- **Spacing**: small table density; full-width grid item.
- **States**: empty, populated, focused, disabled rule, invalid expression.
- **Accessibility**: visible column labels; tooltip help on expression label; keyboard-editable cells.
- **Motion**: no decorative motion.
- **Layout**: full-width grid.

### Configuration Dialog
- **Structure**: Element Plus dialog, top-label form, footer actions.
- **Variants**: card style and field advanced settings.
- **Spacing**: 16px grid gap; consistent aligned edges.
- **States**: default, editing, validation error, modal script editor.
- **Accessibility**: dialog focus management delegated to Element Plus; icon buttons have labels.
- **Motion**: standard dialog transition.
- **Layout**: bounded dialog with content scroll when necessary.

## 6. Motion & Interaction

- Use existing Element Plus transitions.
- Interactive controls require visible hover/focus states.
- No decorative animation is introduced.

## 7. Depth & Surface

Strategy: mixed, using Element Plus borders for editor boundaries and restrained elevation for dialogs. Tables and script inputs use `--ds-border`; dialogs use the existing Element Plus elevated surface.

## 8. Accessibility Constraints & Accepted Debt

- Every input must have a visible label or an explicit accessible label.
- Icon-only edit buttons must expose an accessible name.
- Condition help must be available through keyboard focus as well as mouse hover.
- Tables must remain usable at narrow widths through horizontal scrolling rather than clipped content.
- Accepted debt: existing application-wide type errors outside the changed components are not part of this UI refinement.
