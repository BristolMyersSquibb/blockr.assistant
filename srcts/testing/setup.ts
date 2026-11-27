// The setup of the tests on happy-dom, which vitest.config.ts lists after the
// setup of blockr.ui's stubs, `@blockr/ui/stubs/setup`.
// That setup fails a test on an error or a warning that the test prints and
// does not set off on purpose.
// This setup allows one error of core's, until core no longer sets it off
// (https://github.com/BristolMyersSquibb/blockr.core/issues/900).
// React logs the error each time core's Edit board plugin mounts the form of an
// advanced action.
// The plugin mounts the form in a layout effect.
// There, the call of flushSync() in core's drawForm() cannot flush.
// A test that draws core's basic frontend draws the plugin, and so sets off the
// error.

import { allowMessage } from "@blockr/ui/stubs/setup";

allowMessage((message) => message.startsWith("flushSync was called from inside a lifecycle method") && /\bdrawForm\b/.test(new Error().stack ?? ""));
