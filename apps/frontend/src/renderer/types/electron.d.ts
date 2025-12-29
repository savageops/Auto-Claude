import { ElectronAPI } from '../../shared/types/ipc';

declare global {
    interface Window {
        electronAPI: ElectronAPI;
        DEBUG: boolean;
    }
}

export { };
