# StateBacked.dev CLI - launch an XState backend in 5 minutes

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/statebacked/smply/blob/main/LICENSE) [![npm version](https://img.shields.io/npm/v/smply.svg?style=flat)](https://www.npmjs.com/package/smply) [![CI](https://github.com/statebacked/smply/actions/workflows/ci.yaml/badge.svg)](https://github.com/statebacked/smply/actions/workflows/ci.yaml) [![Docs](https://img.shields.io/badge/docs-smply-blue)](https://docs.statebacked.dev/)

[StateBacked.dev](https://statebacked.dev) runs XState machines as your secure, scalable, serverless backend.

Check out the full State Backed [docs](https://docs.statebacked.dev) for more detailed information and to
get started with your own XState backend as a service.

# 5 minute quick start

```bash
$ npm install -g smply
$ smply machines create --machine toggler --node ./toggler.ts # toggler.ts as below
$ # You can now launch instances of your toggler machine, send events, and read state!
```

**your-frontend.ts**

```javascript
import { StateBackedClient } from "@statebacked/client";
import { useMachine } from "@statebacked/react";
import { useActor } from "@xstate/react";

// setting up a client that authenticates by exchanging your existing identity provider's
// token (e.g. Auth0, Supabase, Cognito, etc) for a State Backed token.
// 0 server-side code required for end-to-end secure authorization.
const client = new StateBackedClient({
  identityProviderToken: () => getYourAuthProviderToken(),
  orgId: "org_...", // from `smply orgs list`
  tokenProviderService: "your-app", // configured with `smply token-providers upsert`
});

// you can also mint your own State Backed token and use:
// const client = new StateBackedClient({ token });

export const YourReactComponent = () => {
  // reads or creates an instance of 'your-machine' named 'instance-name' and
  // establishes a real-time connection to retrieve state updates as they happen
  // this means multiplayer use cases are easy and *identical* to single-player.
  // pass template arguments for a strongly-typed actor.
  const { actor } = useMachine("your-machine", "instance-name");

  if (!actor) {
    // actor is loading
    return null;
  }

  return <InnerComponent actor={actor} />;
};

export const InnerComponent = ({ actor }) => {
  // use your persistent, cloud actor just as you would a local state machine
  const [state, send] = useActor(actor);

  // state is synced in real-time from your cloud machine instance

  return (
    <div>
      In state: {state.value}
      <button
        onClick={() => {
          // send events to your cloud instance just as you would a local machine
          send("say-hi");
        }}
      >
        Say hi!
      </button>
    </div>
  );
};
```

**toggler.ts**

```javascript
import { createMachine } from "xstate";
import type { AllowRead, AllowWrite } from "@statebacked/machine-def";

// super simple authorization
// authContext comes from a JWT that you create with your user's information,
// signed with one of your State Backed keys (generate a key via `smply keys create`)
export allowRead: AllowRead = ({ machineInstanceName, authContext }) =>
  machineInstanceName === authContext.sub

export allowWrite: AllowWrite = ({ machineInstanceName, authContext }) =>
  machineInstanceName === authContext.sub

// export any XState state machine with any guards, actions, or services and any delays.
// just make sure that no service runs for more than 10 seconds.
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
