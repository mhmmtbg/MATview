const fs=require('fs'),vm=require('vm');
module.exports=function(files){let src=files.map(f=>fs.readFileSync(__dirname+'/../src/'+f,'utf8')).join('\n');return new Function(src+'\nreturn MLAB;')();};
