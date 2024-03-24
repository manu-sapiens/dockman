const { contextBridge, ipcRenderer, shell } = require('electron');
const { exec } = require('child_process');

const icon_yes = "☑️";
const icon_checking = "👀";
const icon_pause= "😴";

let docker_installed_check_ongoing = false;
let ongoing_check_duration = 0;

contextBridge.exposeInMainWorld('electron', {

    openExternal: (url) => 
    {
        shell.openExternal(url)
        ongoing_check_duration = 0;
        if (!docker_installed_check_ongoing)
        {
            async_waitForDockerToBeInstalled();
        }
    },

    // Function for the renderer to send messages to the main process
    send: (channel, data) => 
    {
        // Channels the renderer process can send messages to
        let validSendChannels = ['docker-installed-status2'];
        if (validSendChannels.includes(channel)) 
        {
            ipcRenderer.send(channel, data);
        }
    },

    // Function to receive messages from the main process
    receive: (channel, func) => 
    {
        console.log("RECEIVE, channel =", channel);
        let validReceiveChannels = ['docker-installed-status2'];
        if (validReceiveChannels.includes(channel)) 
        {
            // Deliberately strip event as it includes `sender` and is a security risk
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
        else
        {
            console.error("Using unknown channel: ", channel);
        }
    },

});
async function async_checkDockerInstalled() 
{
    console.log("----> docker-installed-status (Checking)");
    return new Promise((resolve) => 
    {
        exec('docker --version', (error, stdout, stderr) => 
        {
            if (error) {
                console.warn(`Docker is not installed. (Exec error: ${error})`);
                resolve(false);
            }
            else
            {
                console.log('Docker is installed');
                resolve(true);
            }
        });
    });
}


async function async_waitForDockerToBeInstalled(intervalTime = 10000, timeout = 3600000) {
    console.log("Waiting for Docker to be installed...");
    
    ongoing_check_duration = 0;
    docker_installed_check_ongoing = true;
    // Create a loop that continues until Docker is running or until the timeout is reached

    ipcRenderer.send('docker-installed-status2', icon_checking);
    while (true)//ongoing_check_duration < timeout) 
    {
        console.log("TICK...");
        try {
            // Try checking if Docker is running
            const docker_is_installed = await async_checkDockerInstalled();
            if (docker_is_installed) 
            {
                console.log('Docker is now installed after waiting for ', ongoing_check_duration, 'milliseconds.');
                // send message to main to close the download window
                ipcRenderer.send('docker-installed-status2', icon_yes);
                
                return;
            }
        } 
        catch (error) 
        {
            // Error while checking if Docker is running
            console.error('Error while checking if Docker is installed:', error.message);
        }

        // If Docker isn't running, wait for a second and try again
        await new Promise(resolve => setTimeout(resolve, intervalTime));
        ongoing_check_duration += intervalTime;       
    }
}

ipcRenderer.send('docker-installed-status2', icon_pause);