/****************
This Script will take a screen shot of the page and open email client to paste it in for sending
Alternative to screenshot, here we take picture and save info off to a .eml file, then download it.  WHen you lick it then, Outlook loads
****************/ 
console.log("Alvis Time: Screenshot Injection Script is loaded");

window.resizeTo(800, 600);

//Now get our data to poast
chrome.storage.local.get("screenshotData", function(data) {
    console.log("Alvis Time: Got screenshotData from local storage");
    console.log(data);

    if (data) {
        console.log("Alvis Time: Completing a post for: " + data.screenshotData.emailAddress + " = " + data.screenshotData.pageToLoad);
        //Call back to backgrhound script ge the screenshot
        chrome.runtime.sendMessage({action: "takescreenshot"}, function(response) {
            console.log("Alvis Time: Got a reply back message");
            if (response.imgSrc) {
                //Got all the info, build the email
                console.log("Alvis Time: Has data so doing email");
                createEML(data.screenshotData, response.imgSrc);
            }
        });
    }
});

//Build the EML file from the screenshot data and image and then download it
function createEML(screenshotData, inputImage) {

    //Now build EML file
    var emlContent = "data:message/rfc822 eml;charset=utf-8,";
    emlContent += 'To: '+screenshotData.emailAddress+'\n';
    emlContent += 'Subject: '+screenshotData.subject+'\n';
    emlContent += 'X-Unsent: 1'+'\n';
    emlContent += 'Content-Type: text/html'+'\n';
    emlContent += ''+'\n';
    emlContent += screenshotData.body + '<br><br><img width="20" height="50" src="' + inputImage + '">';
    emlContent += ''+'\n';
    emlContent += ''+'\n';

    console.log("Alvis Time: FInal state of email creation");
    
    var encodedUri = encodeURI(emlContent); //encode spaces etc like a url
    var a = document.createElement('a'); //make a link in document
    var linkText = document.createTextNode("fileLink");
    a.appendChild(linkText);
    a.href = encodedUri;
    a.id = 'fileLink';
    a.download = screenshotData.date + '_' + screenshotData.name.replace(' ', '_') + '.eml';
    a.style = "display:none;"; //hidden link
    document.body.appendChild(a);
    document.getElementById('fileLink').click(); //click the link

}

