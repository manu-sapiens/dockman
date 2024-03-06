const { contextBridge, ipcRenderer } = require('electron');
const { exec, spawn } = require('child_process');

contextBridge.exposeInMainWorld('electronAPI', {
    checkDockerInstalled: (callback) => {
        exec('docker --version', (error, stdout, stderr) => {
            callback(error, stdout, stderr);
        });
    },
    
    startContainer: () => {
        console.log("--- START CONTAINER ---");
        const composeProcess = spawn('docker-compose', ['up']);

        composeProcess.stdout.on('data', (data) => {
            console.log("CONTAINER: ", data.toString());
            ipcRenderer.send('docker-output', data.toString());
        });

        composeProcess.stderr.on('data', (data) => {
            console.error("ERROR: ", data.toString());
            ipcRenderer.send('docker-output', data.toString());
        });
        
        composeProcess.on('close', (code) => {
            ipcRenderer.send('docker-output', `Docker-compose exited with code ${code}`);
        });
    },

    // This method is for setting up a receiver in the preload script
    receive: (channel, func) => {
        console.log("RECEIVE, channel =", channel);
        ipcRenderer.on(channel, (event, ...args) => func(...args));
    },

    openNewWindow: (url) => {
        ipcRenderer.send('open-new-window', url);
    },

    toggleDevTools: () => {
        ipcRenderer.send('toggle-dev-tools');
    },
});