const { contextBridge, ipcRenderer } = require('electron');
const { exec, spawn } = require('child_process');
const yaml = require('js-yaml');
const fs = require('fs');
const { start } = require('repl');
const axios = require('axios');
const { resolve } = require('path');



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

const urlToDownloadDockerDesktop = "https://www.docker.com/products/docker-desktop/";
//const dockerComposeYaml = fs.readFileSync('./docker-compose.yml', 'utf8');
//const dockerComposeConfig = yaml.load(dockerComposeYaml);

let ping_startTime = 0;
let ping_interval = 0;
let ping_timeout = 0;
let ping_url = "";



// ----------------------------------
async function async_checkDockerInstalled() 
{
    console.log("[async_checkDockerInstalled] Checking if Docker is installed...");
    console.log("----> docker-status-update (Checking)");
    return new Promise((resolve, reject) => 
    {
        exec('docker --version', (error, stdout, stderr) => 
        {
            if (error) {
                console.warn(`Docker is not installed. (Exec error: ${error})`);
                ipcRenderer.send('docker-status-update', `Docker installed: ⚠️\nDocker running: 😴`);
                resolve(false);
            }
            else
            {
                console.log('[async_checkDockerInstalled]Docker is installed');
                ipcRenderer.send('docker-status-update', `Docker installed: ☑️\nDocker running: 👀`);
                resolve(true);
            }
        });
    });
}

async function async_periodicallyCheckIfDockerIsInstalled(timeout = 3600000) {
    console.log("Waiting for Docker to be installed...");

    const intervalTime = 1000; // Check every second
    let totalTime = 0;

    // Create a loop that continues until Docker is running or until the timeout is reached
    while (totalTime < timeout) {
        try {
            // Try checking if Docker is running
            await async_checkDockerInstalled();
            console.log('Docker is now installed after waiting for ', totalTime, 'milliseconds.');
            return true; // Exit the loop and function since Docker is running
        } catch (error) {
            // If Docker isn't running, wait for a second and try again
            ipcRenderer.send('docker-status-update', `Docker installed: ⏳\nDocker running: 😴`);
            await new Promise(resolve => setTimeout(resolve, intervalTime));
            totalTime += intervalTime;
        }
    }

    // If the loop exits due to timeout, throw an error
    throw new Error('Timeout waiting for Docker to run after ' + (timeout/1000.0) + ' seconds');
}

async function async_checkDockerRunning() {
    console.log("Checking if Docker is running...");

    return new Promise((resolve, reject) => 
    {
        exec('docker info', (error, stdout, stderr) => 
        {
            if (stderr.includes("Cannot connect to the Docker daemon")) 
            {
                //console.error('Docker is not running');
                ipcRenderer.send('docker-status-update', `Docker installed: ☑️\nDocker running: X`);
                resolve(false);
            }
            else if (error) 
            {
                reject(new Error(error.message));
            } 
            else 
            {
                ipcRenderer.send('docker-status-update', `Docker installed: ☑️\nDocker running: ☑️`);
                console.log('Docker is running ☑️');
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
                ipcRenderer.send('docker-status-update', `Docker installed: ☑️\nDocker running: ☑️`);
                return true; // Exit the loop and function since Docker is running
            }
            ipcRenderer.send('docker-status-update', `Docker installed: ☑️\nDocker running: ⏳`);
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

    return new Promise((resolve, reject) => {
        exec(`docker images -q ${imageName}`, (error, stdout, stderr) => 
        {
            if (error) 
            {
                console.error(`exec error: ${error}`);
                reject(new Error(`Failed to check if image exists: ${error.message}`));
            } 
            else 
            {
                const imageExists = stdout.trim() ? true : false; // Use trim() to remove any whitespace

                if (imageExists) 
                {
                    console.log('Image exists:', imageName);
                    ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: 😴\nApplication ready: 😴`);
                } 
                else 
                {
                    console.log('Image does not exist:', imageName);
                    ipcRenderer.send('container-status-update', `Container downloaded: X\nContainer running: 😴\nApplication ready: 😴`);
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
    ipcRenderer.send('container-status-update', `Container downloading: ⏳\nContainer running: 😴\nApplication ready: 😴`);

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
            ipcRenderer.send('docker-output', data.toString()); // Send error feedback
        });

        pullProcess.on('close', (code) => 
        {
            if (code === 0) 
            {
                ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: 😴\nApplication ready: 😴`);
                console.log('Image pulled successfully');
                resolve(true);
            }
            else
            {
                console.error('Failed to pull image');
                ipcRenderer.send('container-status-update', `Container downloaded: ⚠️\nContainer running: ⚠️\nApplication ready: ⚠️`);
                reject(new Error('Failed to pull image'));
            }
        });
    });
}
// ----------------------------------
async function async_updateImageAndStartContainer(imageName) 
{
    console.log("Updating image and starting container:", imageName);

    try 
    {
        await async_downloadOrUpdateImage(imageName);
        console.log('Docker image updated. Proceeding to start the container...');
        // Here you can proceed to start the container using the image
    }
    catch (error) 
    {
        console.error('An error occurred while updating the Docker image:', error.message);
        // Handle the error appropriately
    }
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
    // test if macOS
    if (process.platform !== 'darwin') {
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


async function async_checkIfImageIsRunning(imageName) 
{
    console.log("Checking if image:", imageName, "is running...");

    return new Promise((resolve, reject) => 
    {
        const execString = `docker ps --filter "ancestor=${imageName}" --format json`;
        console.log("execString:", execString);
        exec(execString, (error, stdout, stderr) =>
        {
            console.log("stdout:", stdout);
            console.log("stderr:", stderr);
            console.log("error:", error);

            if (error) 
            {
                console.error(`Error checking if image is running: ${error}`);
                reject(error);
            }
            else 
            {
                if (stdout !== "")            
                {
                    try
                    {
                        const jsonOutput = JSON.parse(stdout);
                        console.log("jsonOutput:", jsonOutput);
                        const imageId = jsonOutput.ID;
                        if (imageId)
                        {
                            console.log('Image is running:', imageName, " id = ", imageId);
                            resolve(imageId);
                            return;
                        }
                    }
                    catch (error)
                    {
                        console.error('Error parsing docker ps stdout:', error.message);
                    }
                }

                console.log('Image is not running:', imageName);
                resolve(null);
                return;
            }
        });
    });
}


let product_launched = false;
// ----------------------------------

async function async_startContainer()
{
    ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer STARTING: ⏳\nApplication ready: 😴`);

    let args = ['run'];
    args = args.concat(dockerRunOptions);
    args.push(imageName);
    console.log("Starting container with args:", args);

    try
    {
        await async_spawnContainer(args);
    }
    catch
    {
        console.error("Failed to start container with args:", args);      
    }
}


async function async_restartContainer(containerId)
{
    ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer RESTARTING: ⏳\nApplication ready: 😴`);

    let args = ['restart', containerId];  
    console.log("Restarting container with args:", args);
    try
    {
        await async_spawnContainer(args);
        await async_spawnContainer(['attach', containerId]);
        
    }
    catch
    {
        console.error("Failed to restart container with args:", args);      
    }
}


async function async_spawnContainer(spawn_args) 
{
    //ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: ⏳\nApplication ready: 😴`);
    return new Promise((resolve, reject) => 
    {
        console.log("START/RE-START CONTAINER with args: ",spawn_args);
        //const composeProcess = spawn('docker-compose', ['up']);
        const containerProcess = spawn('docker', spawn_args);
        containerProcess.stdout.on('data', (data) => 
        {
            console.log("CONTAINER: ", data.toString());
            ipcRenderer.send('docker-output', data.toString());

            // check if the data contains the containerReadyString and if so, open the window to urlToLaunchWhenReady
            if (data.toString().includes(containerReadyString)) 
            {
                ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: ☑️\nApplication ready: ☑️`);
                ipcRenderer.send('open-product-window', urlToLaunchWhenReady);
            }

            /*
            if (data.toString().includes(containerExistsString)) {
                console.log("!!!!!! (from error) Container exists");
                ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: ☑️\nApplication ready: ⏳`);
            
                if (!product_launched)
                {
                    ipcRenderer.send('open-product-window', urlToLaunchWhenReady);
                    product_launched = true;
                }
            }
            */

        });

        containerProcess.stderr.on('data', (data) => 
        {
            console.error("ERROR: ", data.toString());
            ipcRenderer.send('docker-output', data.toString());

        });

        containerProcess.on('close', (code) => 
        {
            console.log("CLOSE: ", code);
            ipcRenderer.send('docker-output', `Docker-compose exited with code ${code}`); 
            if (code === 0) 
            { 
                ipcRenderer.send('container-exited', code); // Optionally send the exit code to the renderer 
                resolve(code); // Resolve the promise successfully with the exit code 
            } 
            else
            {
                ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: ⚠️`);
                reject(new Error(`Docker-compose exited with code ${code}`)); 
                // Reject the promise with an error
            }
        });
    });
}
 
async function async_ping(url)
{
    console.log('[ping]...');

    try 
    {
        const response = await axios.get(url);
        if (response.status === 200) {
            console.log('[ping] Service is healthy');
            console.log('[PING] Service is up and running. Opening product window.');
            ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: ☑️\nApplication ready: ☑️`);
            ipcRenderer.send('open-product-window', urlToLaunchWhenReady);    
            return true;
        } 
        else 
        {
            console.warn('[ping] Service responded, but not with a 200 status: ', response.status);
            return false;
        }
    } 
    catch (error) 
    {
        console.warn('[ping] Error pinging service or no response:', error.message);
        return false;
    }
}


async function async_recurringPing()
{
    console.log("Date.now(), startTime, timeout, url: ", Date.now(), ping_startTime, ping_timeout, ping_url);

    if (Date.now() - ping_startTime > ping_timeout) 
    {
        console.error('[PING] Timeout reached, service did not start.');
        return false;
    }

    try 
    {
        const ping_successful = await async_ping(ping_url);
        if (ping_successful) 
        {
            return true;
        }
        else 
        {
            console.error('[PING] Service is NOT up and running.');
            setTimeout(async_recurringPing, ping_interval); // Try again after the interval
        }
    }
    catch (error) 
    {
        console.error('[PING] Error pinging service or no response:', error.message);
        setTimeout(async_recurringPing, ping_interval); // Try again after the interval
    }
}


async function async_pingService(intervalSeconds, timeoutSeconds, url) 
{
    console.log("async_pingService...");
    ping_url = url;
    ping_startTime = Date.now();
    ping_interval = intervalSeconds * 1000; // Convert seconds to milliseconds
    ping_timeout = timeoutSeconds * 1000; // Convert seconds to milliseconds
    const result = async_recurringPing();
    return result;
}



async function async_composeContainer() 
{
    ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer CHECKING: ⏳\nApplication ready: 😴`);
    return new Promise((resolve, reject) => 
    {
        console.log("DOCKER COMPOSE UP");
        const composeProcess = spawn('docker-compose', ['up']);
        composeProcess.stdout.on('data', (data) => 
        {
            console.log("CONTAINER: ", data.toString());
            ipcRenderer.send('docker-output', data.toString());

            /*
            // check if the data contains the containerReadyString and if so, open the window to urlToLaunchWhenReady
            if (data.toString().includes(containerReadyString)) 
            {
                ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: ☑️\nApplication ready: ☑️`);
                ipcRenderer.send('open-product-window', urlToLaunchWhenReady);
            }
            */

        });

        composeProcess.stderr.on('data', (data) => 
        {
            console.error("ERROR: ", data.toString());
            ipcRenderer.send('docker-output', data.toString());

        });

        composeProcess.on('close', (code) => 
        {
            console.log("CLOSE: ", code);
            ipcRenderer.send('docker-output', `Docker-compose exited with code ${code}`); 
            if (code === 0) 
            { 
                ipcRenderer.send('container-exited', code); // Optionally send the exit code to the renderer 
                //resolve(code); // Resolve the promise successfully with the exit code 
            } 
            else
            {
                ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: ⚠️`);
                reject(new Error(`Docker-compose exited with code ${code}`)); 
                // Reject the promise with an error
            }
        });

        resolve(true);
    });
}

contextBridge.exposeInMainWorld('electronAPI', {

    // Function for the renderer to send messages to the main process
    send: (channel, data) => {
        // Channels the renderer process can send messages to
        let validSendChannels = ['startDockerInstall', 'docker-status-update','container-status-update'];
        if (validSendChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },

    // Function to receive messages from the main process
    receive: (channel, func) => {
        console.log("RECEIVE, channel =", channel);
        let validReceiveChannels = ['docker-status-update','container-status-update', 'docker-output', 'container-exited'];
        if (validReceiveChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender` and is a security risk
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
        else
        {
            console.error("Using unknown chanel: ", channel);
        }
    },

    async electron_checkDockerInstalled() 
    {
        
        const docker_is_installed = await async_checkDockerInstalled();
        if (docker_is_installed)
        {
            ipcRenderer.send('docker-status-update', `Docker installed: ☑️\nDocker running: 👀`);
        }
        else
        {
            ipcRenderer.send('docker-status-update', `Docker installed: ⚠️\nDocker running: ⚠️`);
        }
        return docker_is_installed;
    },


    electron_startContainer: () => {
        console.log("--- startContainer request received ---");
        async_startContainer();
    },

    electron_openProductWindow: (url) => {
        ipcRenderer.send('open-product-window', url);
    },

    electron_toggleDevTools: () => {
        ipcRenderer.send('toggle-dev-tools');
    },
});





async function async_init() 
{

    try 
    {
        await async_checkDockerInstalled();
    }
    catch (error) 
    {
        console.error("Docker is not installed");
        // Let's open a window to download Docker Desktop

        console.log("OPENING a window to install docker");

        ipcRenderer.send('open-new-window', urlToDownloadDockerDesktop);
        await async_periodicallyCheckIfDockerIsInstalled();
    }

    // Docker is installed... but is it running?
    try 
    {
        const docker_running = await async_checkDockerRunning();
        if (docker_running) 
        {
            console.log("Docker is running");
            // Proceed with using Docker
        } 
        else 
        {
            console.error("Docker is not running - attempting to start it...");
            try 
            {
                await async_startDocker();
            }
            catch (error) 
            {
                console.error("Error starting Docker:", error.message);
                // Let's do something about it! (TBD)
                return;
            }
        }
    }
    catch (error) 
    {
        console.error("Error while checking Docker:", error.message);
        // Let's do something about it! (TBD)
        return;
    }
    
    try 
    {
        const imageExists = await async_checkImageDownloaded(imageName);

        if (imageExists) 
        {
            console.log("Image already downloaded.");
            // Proceed with using the image

        } 
        else 
        {
            console.log("Image not found. Downloading now...");
            // Call your function to download the image

            try 
            {
                await async_downloadOrUpdateImage(imageName);
            }
            catch (error)
            {
                console.error("Error downloading Docker image:", error.message);
                // Handle error (e.g., display an error message to the user)
                return;
            }
        }
    } 
    catch (error) 
    {
        console.error("Error checking for Docker image:", error.message);
        // Handle error (e.g., display an error message to the user)
    }


    const inital_ping_successful = await async_ping(healthCheckUrl);
    if (!inital_ping_successful)
    {
        console.error("[INIT] Inital ping failed. Will Compose-Up the container now...");
        ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nContainer running: ⏳\nApplication ready: 😴`);

        try
        {
            await async_composeContainer();
        }
        catch (error)
        {
            console.error("Error starting container:", error.message);
            // Handle error (e.g., display an error message to the user)
            return;
        }

        console.log("[INIT] COMPOSE done... Pinging the service until timeout or success.");

        try
        {
            const recurrent_ping_successful = await async_pingService(1, 3600, healthCheckUrl);

            if (!recurrent_ping_successful)
            {
                throw new Error("Failed to get the service running. Exiting.");
            }
        }
        catch
        {
            console.error("[INIT] Failed to get the service running. Exiting.");
            return;
        }
    }
}

console.log("INIT -----------------------------");
async_init();
console.log("POST INIT -----------------------------");
