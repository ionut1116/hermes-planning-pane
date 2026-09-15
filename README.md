# Hermes Planning Pane

A Hermes Desktop plugin that reads and creates `task_plan.md`, `findings.md`, and `progress.md` on the connected Hermes server. It uses the active remote profile's backend through the scoped plugin REST API, so an SSH-connected Desktop does not read planning files from the local computer.

## Install

The server must have the `planning-with-files` skill installed.

Install and enable the agent/backend half on the Hermes server:

```bash
hermes plugins install https://github.com/ionut1116/hermes-planning-pane/tree/main/planning-pane --enable
```

In Hermes Desktop, install the desktop half from:

```text
https://github.com/ionut1116/hermes-planning-pane/tree/main/planning-pane
```

If an older copy exists, select **Force reinstall**. Then enable **Planning Pane** under Settings → Plugins.

## Verification

Open a server-backed workspace in Desktop, open **Planning**, and click **Create planning files**. Refresh must show the three files from that server workspace.
