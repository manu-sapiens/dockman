const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createMainWindow() 
{
    // Create the browser window.
    const mainWindow = new BrowserWindow(
        {
            width: 800,
            height: 800,
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: true, // it's recommended to keep nodeIntegration off for security
                enableRemoteModule: true, // it's recommended to keep enableRemoteModule off for security
                preload: path.join(__dirname, 'preload.js') // Use a preload script
            }
        });

    // and load the index.html of the app.
    mainWindow.loadFile('index.html');

    // Listen for messages from the renderer
    /*
    ipcMain.on('startDockerInstall', (event, args) => {
        // Logic to start Docker installation

        // Periodically send status updates back to the renderer
        mainWindow.webContents.send('docker-status-update', 'Docker installation started');
    });
    */

    // Listen for the toggle-dev-tools message
    ipcMain.on('toggle-dev-tools', () => 
    {
        console.log("TOGGLE DEV TOOL");
        mainWindow.webContents.openDevTools();
    });

    ipcMain.on('docker-output', (event, data) => 
    {
        mainWindow.webContents.send('docker-output', data);
    });

    ipcMain.on('docker-status-update', (event, data) => 
    {
        mainWindow.webContents.send('docker-status-update', data);
    });

    ipcMain.on('container-status-update', (event, data) => 
    {
        mainWindow.webContents.send('container-status-update', data);
    });

    ipcMain.on('open-product-window', (event, url) =>
    {
        const modal = new BrowserWindow({
            width: 1024,
            height: 1024,
            webPreferences: {
                nodeIntegration: false, // It's a good practice to turn off node integration for web content
                contextIsolation: true, // Protect against prototype pollution
                enableRemoteModule: true, // Turn off remote
                //preload: path.join(__dirname, 'preload.js') // Use a preload script

            }
        });

        modal.loadURL(url);
    });

    ipcMain.on('open-new-window', (event, url) =>
    {
        const modal = new BrowserWindow({
            width: 600,
            height: 600,
            parent: mainWindow,
            webPreferences: {
                nodeIntegration: false, // It's a good practice to turn off node integration for web content
                contextIsolation: true, // Protect against prototype pollution
            }
        });

        modal.loadURL(url);
    });

    // !!!!!! DEBUG
    //mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createMainWindow);


// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () =>
{
    app.quit();

    //if (process.platform !== 'darwin') {
    //app.quit();
    //}
});

app.on('activate', () =>
{
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0)
    {
        createMainWindow();
    }
});

// In this file, you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
