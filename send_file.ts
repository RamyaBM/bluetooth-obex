/// <reference path="chrome.d.ts"/>
/// <reference path="core.ts"/>
/// <reference path="obex.ts"/>
/// <reference path="bluetooth.ts"/>

module SendFile {
  // See https://www.bluetooth.org/en-us/specification/assigned-numbers/service-discovery
  var kOBEXObjectPush = '00001105-0000-1000-8000-00805f9b34fb';

  function log(msg) {
    var msg_str = (typeof (msg) == 'object') ? JSON.stringify(msg) : msg;
    console.log(msg_str);

    var l = document.getElementById('log');
    if (l) {
      l.innerText += msg_str + '\n';
    }
  }

  function clearChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  function createActionButton(label, caption, callback) {
    var button = document.createElement("input");
    button.setAttribute("type", "button");
    button.setAttribute("value", caption);
    button.onclick = callback;

    var labelElement = document.createElement("label");
    labelElement.textContent = label;
    labelElement.appendChild(button);
    return labelElement;
  }

  var profileRegistred = false;

  function registerObexPushProfile(callback: (profile: Bluetooth.Profile) => void) {
    var uuid = kOBEXObjectPush.toLowerCase();
    var profile = { uuid: uuid };

    if (profileRegistred) {
      callback(profile);
      return;
    }

    chrome.bluetooth.addProfile(profile, () => {
      if (chrome.runtime.lastError) {
        log("Error adding \"Obex Push\" profile: " + chrome.runtime.lastError.message);
        return;
      }

      profileRegistred = true;
      callback(profile);
      return;
    });
  }

  function sendFileToSocket(socket: Bluetooth.Socket, name: string, contents: ArrayBuffer, callback: () => void) {
    var requestProcessor = new Bluetooth.RequestProcessor(socket);
    var processor = new Bluetooth.SendFileProcessor(requestProcessor, name, contents);
    processor.setErrorHandler((message: string) => {
      log("Error sending file: " + message);
    });
    var sendFileCallback = (finished: boolean) => {
      log("Packet at offset " + processor.fileOffset + " of " + processor.fileLength + " sent to peer device.");
      if (finished) {
        log("File \"" + name + "\" successfully sent.");
        callback();
      }
      else {
        processor.sendNextRequest(sendFileCallback);
      }
    };
    processor.sendNextRequest(sendFileCallback);
  }

  function sendFileToDevice(device: Bluetooth.Device, fileName: string, contents: ArrayBuffer) {
    log("Sending file \"" + fileName + "\" of length " + contents.byteLength + ".");

    registerObexPushProfile(profile => {
      Bluetooth.connectionDispatcher.setHandler(device, profile, (socket) => {
        sendFileToSocket(socket, fileName, contents, () => {
          chrome.bluetooth.disconnect({ socket: socket }, () => {
            console.log("Socket disconnected!");
          });
        });
      });

      chrome.bluetooth.connect({ device: device, profile: profile }, function () {
        if (chrome.runtime.lastError)
          log("Error connecting to Object Push profile: " + chrome.runtime.lastError.message);
        else
          log("Successfully connected to Object Push profile.");
      });
    });
  }

  function sendFileAction(device: Bluetooth.Device) {
    chrome.fileSystem.chooseEntry({ type: 'openFile' }, function (readOnlyEntry) {
      readOnlyEntry.file(function (file: any) {
        var reader = new FileReader();
        reader.onerror = e => {
          log("Error loading file: " + e.message);
        };
        reader.onloadend = e => {
          log("File loaded successfully!");
          sendFileToDevice(device, file.name, reader.result);
        };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  function displayDevices() {
    log('Getting list of devices...')
    var table = document.getElementById("device-list");
    clearChildren(table);
    chrome.bluetooth.getDevices({
      deviceCallback: function (device) {
        var row = document.createElement("tr");
        table.appendChild(row);

        var td = document.createElement("td");
        td.innerText = device.address;
        row.appendChild(td);

        var td = document.createElement("td");
        td.innerText = device.name;
        row.appendChild(td);

        var td = document.createElement("td");
        td.innerText = device.paired.toString();
        row.appendChild(td);

        var td = document.createElement("td");
        td.innerText = device.connected.toString();
        row.appendChild(td);

        // Actions
        var td = document.createElement("td");
        row.appendChild(td);
        var objectPushAction = createActionButton("", "Send File...", function () {
          sendFileAction(device);
        });
        td.appendChild(objectPushAction);
      }
    }, function () {
        log('Done getting devices.')
    });
  }

  function Setup() {
    displayDevices();
  }

  window.onload = function () {
    Setup();
  }
}