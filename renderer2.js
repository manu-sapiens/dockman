
const urlToDownloadDockerDesktop = "https://www.docker.com/products/docker-desktop/";

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

