import { GroupPermission } from "../../db/models/Guild";
import IPermissionChangeObserver from "./IPermissionChangeObserver";

export default interface IObservablePermission {
  addPermissionObserver(observer: IPermissionChangeObserver): void;
  notifyPermissionObservers(permissions: GroupPermission[]): Promise<void>;
}
