const express=require('express');
const path=require('path');
const app=express();
const PORT=process.env.PORT||3000;
app.use(express.json());
app.use(express.static(__dirname));
app.get('/api/status',(req,res)=>res.json({ok:true,app:'GARAGE cloud test'}));
app.listen(PORT,()=>console.log('GARAGE running '+PORT));
