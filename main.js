const APP_NAME = "Omnitool";


const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const appHtml = path.join(__dirname, 'app.html');
let appWindow = null;
let managerWindow = null;

function createManagerWindow() 
{
    if (appWindow == null || appWindow.isDestroyed())
    {

        appWindow = new BrowserWindow({
            width: 1024,
            height: 1024,
            webPreferences: {
                nodeIntegration: false, // It's a good practice to turn off node integration for web content
                contextIsolation: true, // Protect against prototype pollution
                enableRemoteModule: true, // Turn off remote
            }
        });
    }

    // rename the window to APP_NAME
    appWindow.setTitle(APP_NAME);

    // move appWindow to make place for managerWindow
    appWindow.focus();
    appWindow.setBounds(
        {
            x: 400,
            y: 0,
        });

    // if app.html exist, load it
    // First check if the file existg
    if (fs.existsSync(appHtml))
    {
        appWindow.loadFile('app.html');
    }

    if (managerWindow == null || managerWindow.isDestroyed())
    {
        // Create the browser window to the left of appWindow
        managerWindow = new BrowserWindow(
            {
                width: 400,
                height: 1024,
                //parent: appWindow,
                webPreferences: {
                    contextIsolation: true,
                    nodeIntegration: true, // it's recommended to keep nodeIntegration off for security
                    enableRemoteModule: true, // it's recommended to keep enableRemoteModule off for security
                    preload: path.join(__dirname, 'preload.js') // Use a preload script
                }
            });

        // move the manager window to the left of the appWindow
        const appWindowBounds = appWindow.getBounds();
        const managerWindowBounds = managerWindow.getBounds();
        managerWindow.setBounds(
            {
                x: appWindowBounds.x - managerWindowBounds.width,
                y: appWindowBounds.y,
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
            if (appWindow && appWindow.isDestroyed() === false)
            {
                if (appWindow.webContents.isDevToolsOpened())
                {
                    appWindow.webContents.closeDevTools();
                }
                else
                {
                    appWindow.webContents.openDevTools();
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
        ipcMain.on('set-download-div-visibility', (event, data) => 
        {
            managerWindow.webContents.send('set-download-div-visibility', data);
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
            if (appWindow)
            {
                if (appWindow.isDestroyed())
                {
                    console.warn("appWindows is destroyed");
                }
                else
                {
                    console.log("Reloading App Window");
                    appWindow.reload();
                    appWindow.focus();
                }
            }
        });

        ipcMain.on('focus-manager-window', (event) =>
        {
            if (managerWindow)
            {
                if (managerWindow.isDestroyed())
                {
                    console.warn("Manager Window is destroyed");
                }
                else
                {
                    managerWindow.focus();
                }
            }
        });

        ipcMain.on('open-product-window', (event, url) =>
        {
            // first check if the window is already open
            // if it is, just focus it
            // if it's not, create a new window
            if (appWindow == null || appWindow.isDestroyed())
            {
                appWindow = new BrowserWindow({
                    width: 1024,
                    height: 1024,
                    webPreferences: {
                        nodeIntegration: false, // It's a good practice to turn off node integration for web content
                        contextIsolation: true, // Protect against prototype pollution
                        enableRemoteModule: true, // Turn off remote
                    }
                });
            }

            appWindow.focus();
            appWindow.loadURL(url);
        });

        /*
        ipcMain.on('open-download-window', (event) =>
        {
            managerWindow.minimize();
            
            if (downloadWindow == null || downloadWindow.isDestroyed())
            {
                downloadWindow = new BrowserWindow({
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
                    }
                });
            
                downloadWindow.loadFile("download-docker.html");
            }
            downloadWindow.focus();    
            
            // DEBUG ONLY !
            downloadWindow.webContents.openDevTools();
            
        });
        */

    }
    managerWindow.focus();


    // !!!!!! DEBUG
    //managerWindow.webContents.openDevTools();

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
