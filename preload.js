const { contextBridge, ipcRenderer } = require('electron');
const { exec, spawn } = require('child_process');
const yaml = require('js-yaml');
const fs = require('fs');
const { start } = require('repl');


const dockerComposeYaml = fs.readFileSync('./docker-compose.yml', 'utf8');
const dockerComposeConfig = yaml.load(dockerComposeYaml);
// Example for a single service
const imageName = "manusapiens/omnitool_metal_pi:latest";//dockerComposeConfig.omnitool.manusapiens.omnitool_metal_pi;

function dockerRunStatusCheck(callback) {
    exec('docker info', (error, stdout, stderr) => {
        if (error) {
            console.error('Docker is not running:', error);
            return callback(false);
        }
        console.log('Docker is running');
        callback(true);
    });
}

function waitForDockerToRun(timeout = 60000) {
    console.log("waiting...");
    return new Promise((resolve, reject) => {
        const intervalTime = 1000; // Check every second
        let totalTime = 0;

        const interval = setInterval(() => {
            console.log('Checking if Docker is running...');
            dockerRunStatusCheck((isRunning) => {
                if (isRunning) {
                    console.log('Docker is now running.');
                    clearInterval(interval);
                    clearTimeout(timeoutHandler);
                    resolve(true);
                }
            });

            totalTime += intervalTime;
            if (totalTime >= timeout) {
                console.log('Timeout waiting for Docker to run.');
                clearInterval(interval);
                reject(new Error('Timeout waiting for Docker to run'));
            }
        }, intervalTime);

        // Setup timeout
        const timeoutHandler = setTimeout(() => {
            clearInterval(interval);
            reject(new Error('Timeout waiting for Docker to run'));
        }, timeout);
    });
}


function checkImageDownloaded(imageName, callback) {
    exec(`docker images -q ${imageName}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);

            return callback(error, null);
        }
        const imageExists = stdout ? true : false;

        if (imageExists) {
            console.log('Image exists:', imageName);
        } else {
            console.log('Image does not exist:', imageName);
        }

        callback(null, imageExists);
    });
}

function downloadOrUpdateImage(imageName, callback) {
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
            callback(null, true);
        } else {
            console.error('Failed to pull image');
            callback(new Error('Failed to pull image'), false);
        }
    });
}

const containerReadyString = "Server has started and is ready to accept connections on";
const containerExistsString = "Attaching to ";
const dockerNotRunningString = "Cannot connect to the Docker";

const urlToLaunchWhenReady = "http://127.0.0.1:1688";

function checkDockerDaemon(callback) {
    exec('docker info', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            if (stderr.includes("Cannot connect to the Docker daemon")) {
                return callback(new Error("Docker is not running"), false);
            }
            return callback(error, false);
        }
        callback(null, true); // Docker is running
    });
}

function startDocker(callback) {
    // test if macOS
    if (process.platform !== 'darwin') {
        return callback(new Error('Unsupported platform'), false);
        // for now!
    }

    // Example for macOS
    console.log("MacOs detected. Tryint to start Docker...");

    exec('open -a Docker', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return callback(error, false);
        }


        // Docker is starting, but we may need to wait and verify it's ready
        // Start a polling mechanism here to check Docker's status
        waitForDockerToRun().then(() => {
            console.log('Docker is ready. Proceed with your Docker commands...');
            return callback(null, true);

            // Place code here to proceed with Docker operations
        }).catch((error) => {
            console.error(error.message);
            return callback(error, false);
            // Handle the error (e.g., show an error message to the user)
        });

        callback(null, true);
    });
}


function startContainer() 
{

    console.log("--- START CONTAINER ---");
    const composeProcess = spawn('docker-compose', ['up']);

    composeProcess.stdout.on('data', (data) => {
        console.log("CONTAINER: ", data.toString());
        ipcRenderer.send('docker-output', data.toString());


        // check if the data contains the contaierReadyString and if so, open the window to urlToLaunchWhenReady
        if (data.toString().includes(containerReadyString)) {
            ipcRenderer.send('open-new-window', urlToLaunchWhenReady);
        }

    });

    composeProcess.stderr.on('data', (data) => {
        console.error("ERROR: ", data.toString());
        ipcRenderer.send('docker-output', data.toString());

        if (data.toString().includes(containerExistsString)) {
            //ipcRenderer.send('container-exists', true);
            console.log("!!!!!! (from error) Container exists");
        }
    });
    
    composeProcess.on('close', (code) => {
        console.log("CLOSE: ", code);
        ipcRenderer.send('docker-output', `Docker-compose exited with code ${code}`);
        ipcRenderer.send('container-exited', code); // Send the exit code to the renderer

    });
}

checkDockerDaemon((error, running) => {

    var dockerRunning = false;
    
    if (error) {
        console.warn('Docker is not running.', error);

        // attempt to start docker daemon
        console.log('Attempting to start Docker...');

        startDocker((error, success) => {
            if (error) {
                console.error('Error starting Docker:', error);
            } else if (success) {
                console.log('Docker started successfully');
                dockerRunning = true;
            }
        });

    }
    else
    {
        dockerRunning = true;
    }

    if (dockerRunning)
    {
        console.log('Docker confirmed running');
    
        checkImageDownloaded(imageName, (error, imageExists) => {
            if (error) {
                console.error('Error checking if image exists:', error);
                
            } else if (!imageExists) {
                console.log('Image does not exist, downloading...');
                downloadOrUpdateImage(imageName, (error, success) => {
                    if (error) {
                        console.error('Error downloading image:', error);
                    } else if (success) {
                        console.log('Image downloaded successfully. Starting container...');
                        startContainer();
                    }
                });
            } else {
                console.log('Image already exists. Starting container...');
                startContainer();
            }
        });
                

    }
    else
    {
        console.error('Docker is not running. Cannot proceed.');
    }
    return(callback(null, true));
});


        





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
        startContainer();
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