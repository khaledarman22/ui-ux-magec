# {{PROJECT_NAME}}

Design project managed by **ui-ux-magec** (project id `{{PROJECT_ID}}`, created {{CREATED_AT}}).

- `.ui-ux-magec/` — persistent project state: requirements, research, concepts, design system, Figma node
  mappings, tasks, decisions, feedback and checkpoints. This folder is the source of truth for the project;
  chat history is not.
- `assets/` — brand assets you provide (logos, images, icons).

Common commands (run inside this folder):

```bash
ui-ux-magec status      # progress and next tasks
ui-ux-magec resume      # validate state, reconcile Figma, continue
ui-ux-magec feedback "make the hero more premium"
```

Deleting this folder deletes the project. ui-ux-magec keeps no hidden copy and will not recreate it.
