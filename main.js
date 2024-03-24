const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const icon_yes = "☑️";

let appWindows = null;

function createManagerWindow() 
{
    // Create the browser window.
    const managerWindow = new BrowserWindow(
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
    managerWindow.loadFile('index.html');

    // Listen for the toggle-dev-tools message
    ipcMain.on('toggle-dev-tools', () => 
    {
        console.log("TOGGLE DEV TOOL");

        // Find if the developer tools is open
        if (managerWindow.webContents.isDevToolsOpened())
        {
            // Close the developer tools
            managerWindow.webContents.closeDevTools();
        }
        else
        {
            managerWindow.webContents.openDevTools();
        }

        // do the same for the appWindows
        if (appWindows && appWindows.isDestroyed() === false)
        {
            if (appWindows.webContents.isDevToolsOpened())
            {
                appWindows.webContents.closeDevTools();
            }
            else
            {
                appWindows.webContents.openDevTools();
            }
        }
    });

    ipcMain.on('docker-output', (event, data) => 
    {
        managerWindow.webContents.send('docker-output', data);
    });

    ipcMain.on('docker-output-error', (event, data) => 
    {
        managerWindow.webContents.send('docker-output-error', data);
    });

    ipcMain.on('docker-installed-status', (event, data) => 
    {
        managerWindow.webContents.send('docker-installed-status', data);
    });

    ipcMain.on('docker-running-status', (event, data) => 
    {
        managerWindow.webContents.send('docker-running-status', data);
    });

    ipcMain.on('app-installed-status', (event, data) => 
    {
        managerWindow.webContents.send('app-installed-status', data);
    });

    ipcMain.on('app-running-status', (event, data) => 
    {
        managerWindow.webContents.send('app-running-status', data);
    });


    ipcMain.on('refresh-product-window', (event) =>
    {
        if (appWindows)
        {
            if (appWindows.isDestroyed())
            {
                console.warn("appWindows is destroyed");
            }
            else
            {
                console.log("Reloading App Window");
                appWindows.reload();
                appWindows.focus();
            }
        }
    });

    ipcMain.on('refresh-manager-window', (event) =>
    {
        if (managerWindow)
        {
            if (managerWindow.isDestroyed())
            {
                console.warn("mainWindow is destroyed");
            }
            else
            {
                console.log("Reloading Manager Window");
                managerWindow.reload();
                managerWindow.focus();
            }
        }
    });

    ipcMain.on('open-product-window', (event, url) =>
    {
        // first check if the window is already open
        // if it is, just focus it
        // if it's not, create a new window
        if (appWindows)
        {
            //make sure it has not been destroyed
            if (appWindows.isDestroyed())
            {
                appWindows = null;
            }
            else
            {
                appWindows.focus();
                return;
            }
        }

        appWindows = new BrowserWindow({
            width: 1024,
            height: 1024,
            webPreferences: {
                nodeIntegration: false, // It's a good practice to turn off node integration for web content
                contextIsolation: true, // Protect against prototype pollution
                enableRemoteModule: true, // Turn off remote
            }
        });

        appWindows.loadURL(url);
    });

    ipcMain.on('open-download-window', (event) =>
    {
        //// launch the default browser
        //const { shell } = require('electron');
        //shell.openExternal(url);
        managerWindow.minimize();
        
        const downloadWindow = new BrowserWindow({
            width: 800,
            height: 600,
            parent: null,
            webPreferences: {
                nodeIntegration: true, // It's a good practice to turn off node integration for web content
                contextIsolation: true, // Protect against prototype pollution
                enableRemoteModule: true,
                preload: path.join(__dirname, 'preload2.js') // Use a preload script
            }
        });

        ipcMain.on('docker-installed-status2', (event, data) => 
        {
            downloadWindow.webContents.send('docker-installed-status2', data +" Docker installed");
            if (data === icon_yes)
            {
                downloadWindow.close();
                managerWindow.restore();
                managerWindow.focus();
            }
        });
    
        downloadWindow.loadFile("download-docker.html");
        downloadWindow.webContents.openDevTools();
        
    });

    // !!!!!! DEBUG
    managerWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createManagerWindow);


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
        createManagerWindow();
    }
});

// In this file, you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
