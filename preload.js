const { contextBridge, ipcRenderer, shell } = require('electron');
const { exec, spawn } = require('child_process');
const yaml = require('js-yaml');
const fs = require('fs');
const { start } = require('repl');
const axios = require('axios');
const { resolve } = require('path');

const urlToDownloadDockerDesktop = "https://www.docker.com/products/docker-desktop/";
const serviceName = "omnitool";
const containerReadyString = "Server has started and is ready to accept connections on";
const containerExistsString = "Attaching to ";
const urlToLaunchWhenReady = "http://127.0.0.1:1688";
const healthCheckUrl = "http://127.0.0.1:1688/api/v1/mercenaries/ping";
const imageName = "manusapiens/omnitool_metal_pi:latest";//dockerComposeConfig.omnitool.manusapiens.omnitool_metal_pi;
const dockerRunOptions = 
[
    '-p','1688:4444',
    '-v','./omnitool.data/file-import:/app/omnitool/packages/omni-server/data.local/file-import',
    '-v','./omnitool.data/file-export:/app/omnitool/packages/omni-server/data.local/file-export',
];

const icon_yes = "☑️";
const icon_wait = "⏳";
const icon_no = "❌";
const icon_error = "⚠️";
const icon_pause= "😴";
const icon_checking = "👀";
const APP_NAME = "Omnitool";

//const dockerComposeYaml = fs.readFileSync('./docker-compose.yml', 'utf8');
//const dockerComposeConfig = yaml.load(dockerComposeYaml);

function updateAllStatus(status)
{
    updateDockerInstalledStatus(status);
    updateDockerRunningStatus(status);
    updateAppInstalledStatus(status);
    updateAppRunningStatus(status);
}

function updateDockerInstalledStatus(status)
{
    ipcRenderer.send('docker-installed-status', status + " Docker installed");
}

function updateDockerRunningStatus(status)
{
    ipcRenderer.send('docker-running-status', status + " Docker running");
}

function updateAppInstalledStatus(status)
{
    ipcRenderer.send('app-installed-status', status + " "+APP_NAME+" installed");
}
function updateAppRunningStatus(status)
{
    ipcRenderer.send('app-running-status', status + " "+APP_NAME+" running");
}

// ----------------------------------
async function async_checkDockerInstalled() 
{
    console.log("----> docker-installed-status (Checking)");
    return new Promise((resolve) => 
    {
        exec('docker --version', (error, stdout, stderr) => 
        {
            if (error) {
                console.warn(`Docker is not installed. (Exec error: ${error})`);
                updateDockerInstalledStatus(icon_no);
                resolve(false);
            }
            else
            {
                console.log('Docker is installed');
                updateDockerInstalledStatus(icon_yes);
                resolve(true);
            }
        });
    });
}

async function async_waitForDockerToBeInstalled(intervalTime = 10000, timeout = 3600000) {
    console.log("Waiting for Docker to be installed...");
    
    let totalTime = 0;
    // Create a loop that continues until Docker is running or until the timeout is reached
    while (totalTime < timeout) 
    {
        console.log("TICK...");
        try {
            ipcRenderer.send('docker-installed-status', icon_checking);
            // Try checking if Docker is running
            const docker_is_installed = await async_checkDockerInstalled();
            if (docker_is_installed) 
            {
                console.log('Docker is now installed after waiting for ', totalTime, 'milliseconds.');
                return true; // Exit the loop and function since Docker is running
            }
        } 
        catch (error) 
        {
            // Error while checking if Docker is running
            console.error('Error while checking if Docker is installed:', error.message);
            return false;
        }

        // If Docker isn't running, wait for a second and try again
        await new Promise(resolve => setTimeout(resolve, intervalTime));
        totalTime += intervalTime;
       
    }
    // If the loop exits due to timeout, throw an error
    console.warn('Timeout waiting for Docker to be installed after ' + (timeout/1000.0) + ' seconds');
    ipcRenderer.send('docker-installed-status', icon_error);
    
    return false;
}

async function async_checkDockerRunning() {
    console.log("Checking if Docker is running...");
    
    return new Promise((resolve, reject) => 
    {
        updateDockerRunningStatus(icon_checking);
        exec('docker info', (error, stdout, stderr) => 
        {
            if (stderr.includes("Cannot connect to the Docker daemon")) 
            {
                console.error('Docker is not running');
                updateDockerRunningStatus(icon_no);
                resolve(false);
            }
            else if (error) 
            {
                updateDockerRunningStatus(icon_error);
                reject(new Error(error.message));
            } 
            else 
            {
                updateDockerRunningStatus(icon_yes);
                console.log('Docker is running');
                resolve(true);
            }
        });
    });
}


// ----------------------------------
async function async_periodicallyCheckIfDockerRunning(timeout = 60000) {
    console.log("Waiting for Docker to run...");

    const intervalTime = 1000; // Check every second
    let totalTime = 0;

    // Create a loop that continues until Docker is running or until the timeout is reached
    while (totalTime < timeout) {
        try 
        {
            // Try checking if Docker is running
            const docker_running = await async_checkDockerRunning();
            if (docker_running)
            {
                console.log('Docker is now running after waiting for ', totalTime, 'milliseconds. ☑️');
                return true; // Exit the loop and function since Docker is running
            }
            await new Promise(resolve => setTimeout(resolve, intervalTime));
            totalTime += intervalTime;
        } 
        catch (error) 
        {
            // Error while checking if Docker is running
            console.error('Error while checking if Docker is running:', error.message);
            return false;
        }
    }

    // If the loop exits due to timeout, throw an error
    throw new Error('Timeout waiting for Docker to run after ' + (timeout/1000.0) + ' seconds');    
}


// ----------------------------------
async function async_checkImageDownloaded(imageName) 
{
    console.log("Checking if image exists:", imageName);
    updateAppInstalledStatus(icon_checking);
    return new Promise((resolve, reject) => {
        exec(`docker images -q ${imageName}`, (error, stdout, stderr) => 
        {
            if (error) 
            {
                console.error(`exec error: ${error}`);
                updateAppInstalledStatus(icon_error);
                reject(new Error(`Failed to check if image exists: ${error.message}`));
            } 
            else 
            {
                const imageExists = stdout.trim() ? true : false; // Use trim() to remove any whitespace

                if (imageExists) 
                {
                    console.log('Image exists:', imageName);
                    updateAppInstalledStatus(icon_yes);
                } 
                else 
                {
                    console.log('Image does not exist:', imageName);
                    updateAppInstalledStatus(icon_no);
                }

                resolve(imageExists);
            }
        });
    });
}
// ----------------------------------
async function async_downloadOrUpdateImage(imageName) 
{
    console.log("Downloading or updating image:", imageName);
    updateAppInstalledStatus(icon_wait);
    return new Promise((resolve, reject) => 
    {
        const pullProcess = spawn('docker', ['pull', imageName]);

        pullProcess.stdout.on('data', (data) => 
        {
            console.log(`stdout: ${data}`);
            ipcRenderer.send('docker-output', data.toString()); // Send real-time feedback
        });

        pullProcess.stderr.on('data', (data) => 
        {
            console.error(`stderr: ${data}`);
            ipcRenderer.send('docker-output-error', data.toString()); // Send error feedback
        });

        pullProcess.on('close', (code) => 
        {
            if (code === 0) 
            {
                console.log('Image pulled successfully');
                updateAppInstalledStatus(icon_yes);
                resolve(true);
            }
            else
            {
                console.error('Failed to pull image');
                updateAppInstalledStatus(icon_error);
                reject(new Error('Failed to pull image'));
            }
        });
    });
}
// ----------------------------------
async function async_startDockerMacOs()
{
    console.log("MacOs detected. Trying to start Docker...");

    return new Promise((resolve, reject) => 
    {
        exec('open -a Docker', async (error, stdout, stderr) => 
        {
            if (error) 
            {
                console.error(`exec error: ${error}`);
                reject(new Error(`Failed to start Docker: ${error.message}`));
            }
            else
            {
                console.log('Docker start requested');
                resolve(true);
            }
        })
    });
}


async function async_startDocker() 
{
    updateDockerRunningStatus("...");
    // test if macOS
    if (process.platform !== 'darwin') {
        updateDockerRunningStatus(icon_error);
        throw new Error('Unsupported platform');
        // for now!
    }

    try
    {
        await async_startDockerMacOs();
    }
    catch (error)
    {
        console.error("Error starting Docker:", error.message);
        throw new Error(`Failed to start Docker: ${error.message}`);   
    }

    // Docker is starting, but we may need to wait and verify it's ready
    // Start a polling mechanism here to check Docker's status
    try
    {
        await async_periodicallyCheckIfDockerRunning();
        console.log('Docker is ready. Proceed with your Docker commands...');
    }
    catch (error)
    {
        console.error(error.message);
        throw new Error(`Failed to start Docker: ${error.message}`);   
    }
    
}

// ----------------------------------

async function async_ping(url)
{
    console.log('[ping]...');

    try 
    {
        updateAppRunningStatus(icon_checking);
        const response = await axios.get(url);
        if (response.status === 200) {
            console.log('[ping] Service is healthy');
            console.log('[PING] Service is up and running. Opening product window.');
            updateAppRunningStatus(icon_yes);
            ipcRenderer.send('refresh-product-window'); 
            return true;
        } 
        else 
        {
            console.warn('[ping] Service responded, but not with a 200 status: ', response.status);
        }
    } 
    catch (error) 
    {
        console.warn('[ping] Error pinging service or no response:', error.message);
    }

    updateAppRunningStatus(icon_no);
    return false;

}

async function async_composeContainer(command) 
{
    updateAppRunningStatus(icon_wait);
    return new Promise((resolve, reject) => 
    {
        console.log("DOCKER COMPOSE with command: ", command);
        const composeProcess = spawn('docker-compose', command);//['up']);
        composeProcess.stdout.on('data', (data) => 
        {
            console.log("CONTAINER: ", data.toString());
            ipcRenderer.send('docker-output', data.toString());

            
            // check if the data contains the containerReadyString and if so, open the window to urlToLaunchWhenReady
            if (data.toString().includes(containerReadyString)) 
            {
                // send a command to refresh the application window
                ipcRenderer.send('open-product-window', urlToLaunchWhenReady);   
                updateAppRunningStatus(icon_yes);
                //ipcRenderer.send('refresh-product-window');
            }

        });

        composeProcess.stderr.on('data', (data) => 
        {
            console.error("ERROR: ", data.toString());
            ipcRenderer.send('docker-output-error', data.toString());

        });

        composeProcess.on('close', (code) => 
        {
            console.log("CLOSE: ", code);
            ipcRenderer.send('docker-output', `Docker-compose exited with code ${code}`); 
            if (code !== 0) 
            {
                console.error(`Docker-compose exited with code ${code}`); 
                updateAppRunningStatus(icon_error);
                resolve(false);
            }

            ipcRenderer.send('container-exited', code); // Optionally send the exit code to the renderer 
            updateAppRunningStatus(icon_pause);
            resolve(true);
        });

    });
}

contextBridge.exposeInMainWorld('electronAPI', {

    openExternal: (url) => shell.openExternal(url),

    // Function for the renderer to send messages to the main process
    send: (channel, data) => {
        // Channels the renderer process can send messages to
        let validSendChannels = ['startDockerInstall', 'docker-installed-status', 'docker-running-status','app-installed-status','app-running-status'];
        if (validSendChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },

    // Function to receive messages from the main process
    receive: (channel, func) => {
        console.log("RECEIVE, channel =", channel);
        let validReceiveChannels = ['docker-installed-status', 'docker-running-status','app-installed-status', 'app-running-status', 'docker-output', 'docker-output-error', 'container-exited'];
        if (validReceiveChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender` and is a security risk
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
        else
        {
            console.error("Using unknown channel: ", channel);
        }
    },

    electron_openProductWindow: (url) => {
        ipcRenderer.send('open-product-window', url);
    },

    electron_toggleDevTools: () => {
        ipcRenderer.send('toggle-dev-tools');
    },
});

console.log("INIT -----------------------------");
//async_init();
//async_mainLoop();
async_continuousMonitor();
console.log("POST INIT -----------------------------");


async function async_installDocker()
{
    console.log("PRE async_installDocker -----------------------------");
    ipcRenderer.send('open-download-window');
    const docker_is_installed = await async_waitForDockerToBeInstalled();
    console.log("POST async_installDocker -----------------------------");

    if (!docker_is_installed) 
    {
        console.warn("Docker is not installed yet...");
        return false;
    }    
    console.warn("Docker is NOW installed!");
    return true;
}

async function async_main() 
{

    const docker_is_installed = await async_checkDockerInstalled();
    if (!docker_is_installed) 
    {
        console.warn("Docker is not installed");
        updateDockerInstalledStatus(icon_wait);
        await async_installDocker();
        return false;
    }

    const docker_is_running = await async_checkDockerRunning();
    if (!docker_is_running) 
    {
        console.warn("Docker is not running - attempting to start it...");
        try {await async_startDocker();} catch (error) {console.error("Error starting Docker:", error.message);}
        return false;
    }
    
    const docker_image_exists = await async_checkImageDownloaded(imageName);
    if (!docker_image_exists) 
    {
        console.warn("Image not found. Downloading now...");
        try {await async_downloadOrUpdateImage(imageName);} catch (error) {console.error("Error downloading Docker image:", error.message);}
        return false;
    }
        
    const inital_ping_successful = await async_ping(healthCheckUrl);
    if (inital_ping_successful)
    {
        console.log("Service is already running. Attaching to service.");
        //ipcRenderer.send('open-product-window', urlToLaunchWhenReady);
        ipcRenderer.send('docker-output', "Restarting existing Service...");
        await async_composeContainer(['restart']);//['attach', serviceName]);
    }
    else
    {
        console.log("Service is not running. Starting container...");
        ipcRenderer.send('docker-output', "Service is not running. Starting container...");
        await async_composeContainer(['up']);
    }

    const ping_successful = await async_ping(healthCheckUrl);
    return ping_successful;
}

async function async_continuousMonitor(check_period = 30000)
{
    updateAllStatus(icon_wait);
    console.log("Starting continuous monitor...");
    let main_successful = await async_main();
    console.log("main_successful = ", main_successful);

    let iteration_count = 0;
    while (true)
    {
        console.log("Iteration #: ", iteration_count++);
        let ping_successful = await async_ping(healthCheckUrl);
        if (!ping_successful)
        {
            updateAllStatus(icon_pause);
            main_successful = await async_main();
            if (main_successful) 
            {
                await new Promise(resolve => setTimeout(resolve, check_period));
            }
            else
            {
                await new Promise(resolve => setTimeout(resolve, 10000));
            }

        }
        else
        {
            await new Promise(resolve => setTimeout(resolve, check_period));
        }

        iteration_count++;
    }
}