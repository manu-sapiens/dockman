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


//const dockerComposeYaml = fs.readFileSync('./docker-compose.yml', 'utf8');
//const dockerComposeConfig = yaml.load(dockerComposeYaml);


// ----------------------------------
async function async_checkDockerInstalled() 
{
    console.log("[async_checkDockerInstalled] Checking if Docker is installed...");
    console.log("----> docker-status-update (Checking)");
    return new Promise((resolve) => 
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

async function async_waitForDockerToBeInstalled(intervalTime = 10000, timeout = 3600000) {
    console.log("Waiting for Docker to be installed...");

    let totalTime = 0;
    // Create a loop that continues until Docker is running or until the timeout is reached
    while (totalTime < timeout) {
        try {
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
    return false;
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
                    ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nApplication ready: 😴`);
                } 
                else 
                {
                    console.log('Image does not exist:', imageName);
                    ipcRenderer.send('container-status-update', `Container downloaded: X\nApplication ready: 😴`);
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
    ipcRenderer.send('container-status-update', `Container downloading: ⏳\nApplication ready: 😴`);

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
                ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nApplication ready: 😴`);
                console.log('Image pulled successfully');
                resolve(true);
            }
            else
            {
                console.error('Failed to pull image');
                ipcRenderer.send('container-status-update', `Container downloaded: ⚠️\nApplication ready: ⚠️`);
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

// ----------------------------------

async function async_ping(url)
{
    console.log('[ping]...');

    try 
    {
        const response = await axios.get(url);
        if (response.status === 200) {
            console.log('[ping] Service is healthy');
            console.log('[PING] Service is up and running. Opening product window.');
            ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nApplication ready: ☑️`);
            ipcRenderer.send('refresh-product-window'); 
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


//async function async_recurringPing() 
async function async_pingService(intervalSeconds, timeoutSeconds, url) 
{
    const ping_url = url;
    const ping_startTime = Date.now();
    const ping_interval = intervalSeconds * 1000; // Convert seconds to milliseconds
    const ping_timeout = timeoutSeconds * 1000; // Convert seconds to milliseconds
    let ping_totalTime = 0;

    console.log("Date.now(), startTime, timeout, url: ", Date.now(), ping_startTime, ping_timeout, ping_url);

    while (ping_totalTime < ping_timeout) 
    {
        try {
            const ping_successful = await async_ping(ping_url);
            if (ping_successful) 
            {
                console.log('Application is now healthy after waiting for ', ping_totalTime, 'milliseconds.');
                return true;
            }
        } 
        catch (error) 
        {
            console.error('Error while pinging the service:', error.message);
        }

        console.warn('[PING] Application is not responding (yet)...');
        ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nApplication ready: ⏳`);
        await new Promise(resolve => setTimeout(resolve, ping_interval));
        ping_totalTime += ping_interval;
    }
    console.error('[PING] Timeout reached, service did not start.');
    return false;
}

async function async_startContainer()
{
    async_composeContainer(['up']); // WE DON'T WAIT FOR THE RESULT HERE!

    try
    {
        const recurrent_ping_successful = await async_pingService(1, 3600, healthCheckUrl);
        if (!recurrent_ping_successful)
        {
            console.warn("Timeout while trying to get the service running.");
            return false;
        }
    }
    catch
    {
        console.error("ERROR while pinging the service");
        throw new Error("Failed to get the service running.");    
    }

    return true;

}

async function async_composeContainer(command) 
{
    return new Promise((resolve, reject) => 
    {
        console.log("DOCKER COMPOSE UP");
        const composeProcess = spawn('docker-compose', ['up']);
        composeProcess.stdout.on('data', (data) => 
        {
            console.log("CONTAINER: ", data.toString());
            ipcRenderer.send('docker-output', data.toString());

            
            // check if the data contains the containerReadyString and if so, open the window to urlToLaunchWhenReady
            if (data.toString().includes(containerReadyString)) 
            {
                // send a command to refresh the application window
                ipcRenderer.send('open-product-window', urlToLaunchWhenReady);   
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
            ipcRenderer.send('container-status-update', `Container downloaded: ☑️\Application ready: ⚠️`);
            ipcRenderer.send('docker-output', `Docker-compose exited with code ${code}`); 
            if (code === 0) 
            { 
                ipcRenderer.send('container-exited', code); // Optionally send the exit code to the renderer 
                //resolve(code); // Resolve the promise successfully with the exit code 
            } 
            else
            {
                ipcRenderer.send('container-status-update', `Container downloaded: ☑️\Application ready: ⚠️`);
                //reject(new Error(`Docker-compose exited with code ${code}`)); 
                // Reject the promise with an error
                resolve(false);
            }

            //async_startContainer(); // NO AWAIT HERE!
            resolve(true);
        });

    });
}

contextBridge.exposeInMainWorld('electronAPI', {

    openExternal: (url) => shell.openExternal(url),

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
        let validReceiveChannels = ['docker-status-update','container-status-update', 'docker-output', 'docker-output-error', 'container-exited'];
        if (validReceiveChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender` and is a security risk
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
        else
        {
            console.error("Using unknown chanel: ", channel);
        }
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
        await async_waitForDockerToBeInstalled();
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

        try
        {
            ipcRenderer.send('container-status-update', `Container downloaded: ☑️\nApplication ready: ⏳`);
            await async_startContainer(['up']);
        }
        catch (error)
        {
            console.error("Error starting container:", error.message);
            // Handle error (e.g., display an error message to the user)
            return;
        }

        console.log("[INIT] COMPOSE done... Pinging the service until timeout or success.");

        /*
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
        */
    }
    else
    {
        console.log("[INIT] Inital ping successful. Attaching to service.");
        await async_startContainer(['attach', serviceName]);
    
    }
}

console.log("INIT -----------------------------");
//async_init();
//async_mainLoop();
async_continuousMonitor();
console.log("POST INIT -----------------------------");


// function to exec a command, look at the result and compare it with either a string or, if not provided, a json object or, if not provided, return true if the result isn't null
// if the result is null, it will return false
// if the result is a string, it will compare it with the provided string
// if the result is an object, it will compare it with the provided object
// if the result is an array, it will compare it with the provided array
// if the result is a number, it will compare it with the provided number
// if the result is a boolean, it will compare it with the provided boolean
async function async_execAndCheck(command, trueIfNotEqualTo = null)
{
    try
    {
        const result = exec(command);
        if (typeof trueIfNotEqualTo === 'string')
        {
            // true if trueIfNotEqualTo is not a substring of result
            return !result.includes(trueIfNotEqualTo);
        }
        if (typeof trueIfNotEqualTo === 'object')
        {
            return result !== trueIfNotEqualTo;
        }
        if (typeof trueIfNotEqualTo === 'array')
        {
            return result !== trueIfNotEqualTo;
        }

        return result !== trueIfNotEqualTo;
    }
    catch
    {
        return false;
    }
}
/* USAGE:
const docker_is_installed = async_execAndCheck('docker --version', null);
const docker_is_running = async_execAndCheck('docker info', null);
const docker_image_exists = async_execAndCheck(`docker images -q ${imageName}`, null);
const docker_image_downloaded = async_execAndCheck(`docker pull ${imageName}`, null);
const dockerCompose_is_installed = async_execAndCheck('docker-compose --version', null);
const dockerCompose_is_running = async_execAndCheck('docker-compose ps --format json', null);
const dockerCompose_container_exists = async_execAndCheck(`docker-compose start`, "has no container to start");
const dockerCompose_container_running = async_execAndCheck(`docker-compose ls --format json`, []);
*/

async function async_installDocker()
{
    ipcRenderer.send('open-new-window', "download-docker.html");
    let docker_is_installed = false;
    try {docker_is_installed = await async_waitForDockerToBeInstalled();} catch (error) {console.error("ERROR while checking if docker is installed");}
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
        ipcRenderer.send('docker-status-update', `Docker status: NOT INSTALLED`);
        ipcRenderer.send('container-status-update', `Docker is not installed on your machine.\nWe recommend installing Docker Studio from ${urlToDownloadDockerDesktop} and then coming back here.\n`);
        await async_installDocker();
        return false;
    }

    let docker_is_running = false;
    try {docker_is_running = await async_checkDockerRunning();} catch (error) {console.error("ERROR while checking if docker is running");}
    if (!docker_is_running) 
    {
        console.warn("Docker is not running - attempting to start it...");
        try {await async_startDocker();} catch (error) {console.error("Error starting Docker:", error.message);}
        return false;
    }
    
    let docker_image_exists = false;
    try {docker_image_exists = await async_checkImageDownloaded(imageName);} catch (error) {console.error("Error checking for Docker image:", error.message);}
    if (!docker_image_exists) 
    {
        console.warn("Image not found. Downloading now...");
        try {await async_downloadOrUpdateImage(imageName);} catch (error) {console.error("Error downloading Docker image:", error.message);}
        return false;
    }
    
    let initial_health_ping_successful = false;
    try {initial_health_ping_successful = await async_ping(healthCheckUrl);} catch (error) {console.error("Error pinging service or no response:", error.message);}
    const inital_ping_successful = await async_ping(healthCheckUrl);
    if (inital_ping_successful)
    {
        console.log("Service is already running. Attaching to service.");
        await async_composeContainer(['attach', serviceName]); // NO WAITING HERE!
    }
    else
    {
        console.log("Service is not running. Starting container...")
        await async_composeContainer(['up']); // NO WAITING HERE!
    }

    //const recurrent_ping_successful = await async_pingService(1, 3600, healthCheckUrl);
    //return recurrent_ping_successful;
    const ping_successful = await async_ping(healthCheckUrl);
    return ping_successful;
}

async function async_mainLoop()
{
    let loop_successful = false;
    let loop_count = 0;
    while (!loop_successful && loop_count < 100)
    {
        loop_successful = await async_main();
        loop_count++;
        // wait for 5 s
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (loop_successful)
    {
        console.log("Service is up and running. Opening product window.");
        ipcRenderer.send('open-product-window', urlToLaunchWhenReady);
    }
    else
    {
        console.error("Timeout while trying to get the service running.");
    }

}

async function async_continuousMonitor(check_period = 30000)
{
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