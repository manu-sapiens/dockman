const { contextBridge, ipcRenderer } = require('electron');
const { exec, spawn } = require('child_process');
const yaml = require('js-yaml');
const fs = require('fs');
const { start } = require('repl');


const containerReadyString = "Server has started and is ready to accept connections on";
const containerExistsString = "Attaching to ";
const urlToLaunchWhenReady = "http://127.0.0.1:1688";
const urlToDownloadDockerDesktop = "https://www.docker.com/products/docker-desktop/";
const imageName = "manusapiens/omnitool_metal_pi:latest";//dockerComposeConfig.omnitool.manusapiens.omnitool_metal_pi;

const dockerComposeYaml = fs.readFileSync('./docker-compose.yml', 'utf8');
//const dockerComposeConfig = yaml.load(dockerComposeYaml);

// ----------------------------------
async function async_checkDockerInstalled() 
{
    console.log("Checking if Docker is installed...");

    return new Promise((resolve, reject) => 
    {
        exec('docker --version', (error, stdout, stderr) => 
        {
            if (error) {
                console.error(`exec error: ${error}`);
                reject(new Error(`Docker is not installed: ${error.message}`));
            }
            else
            {
                console.log('Docker is installed');
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
                resolve(false);
            }
            else if (error) 
            {
                reject(new Error(error.message));
            } 
            else 
            {
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
                console.log('Docker is now running after waiting for ', totalTime, 'milliseconds.');
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
async function async_checkImageDownloaded(imageName) {
    console.log("Checking if image exists:", imageName);

    return new Promise((resolve, reject) => {
        exec(`docker images -q ${imageName}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                reject(new Error(`Failed to check if image exists: ${error.message}`));
            } else {
                const imageExists = stdout.trim() ? true : false; // Use trim() to remove any whitespace

                if (imageExists) {
                    console.log('Image exists:', imageName);
                } else {
                    console.log('Image does not exist:', imageName);
                }

                resolve(imageExists);
            }
        });
    });
}
// ----------------------------------
async function async_downloadOrUpdateImage(imageName) {
    console.log("Downloading or updating image:", imageName);

    return new Promise((resolve, reject) => {
        const pullProcess = spawn('docker', ['pull', imageName]);

        pullProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
            ipcRenderer.send('docker-output', data.toString()); // Send real-time feedback
        });

        pullProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
            ipcRenderer.send('docker-output', data.toString()); // Send error feedback
        });

        pullProcess.on('close', (code) => {
            if (code === 0) {
                console.log('Image pulled successfully');
                resolve(true);
            } else {
                console.error('Failed to pull image');
                reject(new Error('Failed to pull image'));
            }
        });
    });
}
// ----------------------------------
async function async_updateImageAndStartContainer(imageName) {
    console.log("Updating image and starting container:", imageName);

    try {
        await async_downloadOrUpdateImage(imageName);
        console.log('Docker image updated. Proceeding to start the container...');
        // Here you can proceed to start the container using the image
    } catch (error) {
        console.error('An error occurred while updating the Docker image:', error.message);
        // Handle the error appropriately
    }
}

// Example usage
//updateImageAndStartContainer("manusapiens/omnitool_metal_pi:latest").catch(console.error);
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

async function init() 
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

    // docker is installed, is running, and the image is downloaded
    // start the container
    try 
    {
        await async_startContainer();
        console.log('Container started successfully.');
        // Proceed with any operations after the container has started
    } 
    catch (error) 
    {
        console.error('Failed to start the container:', error.message);
        // Handle the failure case
    }

}


// ----------------------------------
async function async_startContainer() 
{
    return new Promise((resolve, reject) => 
    {
        console.log("--- START CONTAINER ---");
        const composeProcess = spawn('docker-compose', ['up']);

        composeProcess.stdout.on('data', (data) => 
        {
            console.log("CONTAINER: ", data.toString());
            ipcRenderer.send('docker-output', data.toString());

            // check if the data contains the containerReadyString and if so, open the window to urlToLaunchWhenReady
            if (data.toString().includes(containerReadyString)) {
                ipcRenderer.send('open-product-window', urlToLaunchWhenReady);
            }

            if (data.toString().includes(containerExistsString)) {
                console.log("!!!!!! (from error) Container exists");
                ipcRenderer.send('open-product-window', urlToLaunchWhenReady);
            }

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
                resolve(code); // Resolve the promise successfully with the exit code 
            } 
            else
            { 
                reject(new Error(`Docker-compose exited with code ${code}`)); 
                // Reject the promise with an error
            }
        });
    });
}
        

console.log("PRELOAD");
contextBridge.exposeInMainWorld('electronAPI', {

    /*
    checkDockerRunning: (callback) => {
        checkDockerDaemon((error, running) => {
            if (error) {
                console.error('Docker is not running:', error);
                return callback(error, running);
            }
            callback(null, running);
        });
    },
    */

    checkDockerInstalled: (callback) => {
        exec('docker --version', (error, stdout, stderr) => {
            callback(error, stdout, stderr);
        });
    },
    
    startContainer: () => {
        console.log("--- startContainer request received ---");
        async_startContainer();
    },

    // This method is for setting up a receiver in the preload script
    receive: (channel, func) => {
        console.log("RECEIVE, channel =", channel);
        ipcRenderer.on(channel, (event, ...args) => func(...args));
    },

    openProductWindow: (url) => {
        ipcRenderer.send('open-product-window', url);
    },

    toggleDevTools: () => {
        ipcRenderer.send('toggle-dev-tools');
    },
});


console.log("INIT");
init();
