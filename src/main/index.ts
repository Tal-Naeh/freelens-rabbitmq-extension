import { Main } from "@freelensapp/extensions";
import { RabbitmqIpcMain } from "./ipc";

export default class RabbitmqExtensionMain extends Main.LensExtension {
  private ipc?: RabbitmqIpcMain;

  async onActivate(): Promise<void> {
    this.ipc = RabbitmqIpcMain.createInstance(this);
  }

  protected async onDeactivate(): Promise<void> {
    await this.ipc?.shutdown();
    this.ipc = undefined;
  }
}
