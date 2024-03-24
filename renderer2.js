
const urlToDownloadDockerDesktop = "https://www.docker.com/products/docker-desktop/";
const dockerInstalledStatus2 = document.getElementById('dockerInstalledStatus2');

// --------------------------------------------------
document.addEventListener('DOMContentLoaded', () => 
{
    const downloadDockerBtn = document.getElementById('downloadDocker');
 
    console.log("window =", window);
    console.log("electron =", window.electron);

    downloadDockerBtn.addEventListener('click', () => 
    {
        window.electron.openExternal(urlToDownloadDockerDesktop);
    });

 });

 window.electron.receive('docker-installed-status2', (message) => 
 {
   console.log(`[renderer2.js] docker-installed-status2 message = ${message}`);
   
   // Update your UI based on the message
   dockerInstalledStatus2.innerText = message;
 });
