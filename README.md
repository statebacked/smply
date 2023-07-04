# StateBacked.dev CLI - launch an XState backend in 5 minutes

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/statebacked/smply/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/smply.svg?style=flat)](https://www.npmjs.com/package/smply) [![CI](https://github.com/statebacked/smply/actions/workflows/ci.yaml/badge.svg)](https://github.com/statebacked/smply/actions/workflows/ci.yaml) [![Docs](https://img.shields.io/badge/docs-smply-blue)](https://docs.statebacked.dev/)

[StateBacked.dev](https://statebacked.dev) runs XState machines as your secure, scalable, serverless backend.

Check out the full State Backed [docs](https://docs.statebacked.dev) for more detailed information and to
get started with your own XState backend as a service.

# 5 minute quick start

```bash
$ npm install -g smply
$ npx esbuild --bundle --format=esm --outfile=./toggler.js ./toggler.ts
$ smply machines create --machine toggler --file ./toggler.js
$ # You can now launch instances of your toggler machine, send events, and read state!
```

**toggler.ts**
```javascript
import type { AllowRead, AllowWrite } from "@statebacked/machine-def";

export allowRead: AllowRead = ({ machineInstanceName, authContext }) =>
  machineInstanceName === authContext.sub

export allowWrite: AllowWrite = ({ machineInstanceName, authContext }) =>
  machineInstanceName === authContext.sub

export default createMachine({
  predictableActionArguments: true,
  initial: "on",
  states: {
    on: {
      on: {
        toggle: "off",
      },
    },
    off: {
      on: {
        toggle: "on",
      },
    },
  },
});
```
