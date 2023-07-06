import { createMachine } from "xstate";
import type {
  AllowRead,
  AllowWrite,
} from "@statebacked/machine-def";

export const allowRead: AllowRead = ({ machineInstanceName, authContext }) =>
  machineInstanceName === authContext.sub;

export const allowWrite: AllowWrite<{ type: string }, { uid: string }> = ({
  machineInstanceName,
  context,
  authContext,
}) => {
  return (
    machineInstanceName === authContext.sub && context.uid === authContext.sub
  );
};

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
