import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';



const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/results', async (req, res) => {
    const { stnum, rlevel } = req.query;
    const url = `https://paravi.ruh.ac.lk/fosmis2019/Ajax/result_filt.php?task=lvlfilt&stnum=${stnum}&rlevel=${rlevel}`;

    try {
        const response = await fetch(url);
        const data = await response.text();
        
        res.send(data);
    } catch (error) {
        res.status(500).send('Error fetching data');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
