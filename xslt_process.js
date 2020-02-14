const execSync = require("child_process").execSync
const tmp = require("tmp")
const fs = require("fs")
const vscode = require("vscode")

const loadXml = require("./createXml").pochi


const xsltproc = (dictPath, searchWord) => {

    console.log(dictPath, searchWord)
    const pathToXsl = `"${vscode.extensions.getExtension("tucker.your-mac-dict").extensionPath}/style.xsl"` 

    const tmpfile = tmp.fileSync()
    fs.writeFileSync(tmpfile.name, loadXml(dictPath ,searchWord))
    
    const cmd = ["xsltproc", pathToXsl, tmpfile.name].join(" ")

    let child
    try {
        child = execSync(cmd).toString()
    }catch(e){
        console.log(e)
    }

    tmpfile.removeCallback()

    return child
}

module.exports = { 
    xsltproc
}