import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import * as cheerio from 'cheerio';
import NodeCache from 'node-cache';


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
const noAccessStnum = ['12419', '12391', '12428', '12439', '12373', '12019', '11954', '12404']; // Add the student numbers that should receive "No access" notification
const nonCreditSubjects = ['MAT1142', 'ICT1B13', 'ENG1201'];
const deceasedStnum = ['11845'];



app.get('/results', async (req, res) => {
    const { stnum, rlevel } = req.query;
    console.log(stnum);
    const strippedStnum = stnum.startsWith('a') ? stnum.slice(1) : stnum;

    // Check if the stripped student number is in the no access list
    if (noAccessStnum.includes(strippedStnum) && !stnum.startsWith(9)) {
        return res.status(403).json({ message: 'No access to results for this student number' });
    }

    if (deceasedStnum.includes(strippedStnum)) {
        return res.status(200).json({ message: 'Rest in Peace' });
    }

    const url = `https://paravi.ruh.ac.lk/fosmis2019/Ajax/result_filt.php?task=lvlfilt&stnum=${strippedStnum}&rlevel=${rlevel}`;


    try {
        const response = await fetch(url);
        const data = await response.text();
        // const json = await response.json();
        const $ = cheerio.load(data);
        const grades = {
            'A+': 4.0,
            'A': 4.0,
            'A-': 3.7,
            'B+': 3.3,
            'B': 3.0,
            'B-': 2.7,
            'C+': 2.3,
            'C': 2.0,
            'C-': 1.7,
            'D+': 1.3,
            'D': 1.0,
            'E': 0.0,
            'E*': 0.0,
            'E+': 0.0,
            'E-': 0.0,
            'F': 0.0,
            'MC': 0.0
          };
          
          let totalCredits = 0;
          let totalGradePoints = 0;

          let mathCredits = 0;
          let mathGradePoints = 0;

          let chemCredits = 0;
          let chemGradePoints = 0;

          let phyCredits = 0;
          let phyGradePoints = 0;

          let zooCredits = 0;
          let zooGradePoints = 0;

          let botCredits = 0;
          let botGradePoints = 0;
          
          let csCredits = 0;
          let csGradePoints = 0;
  
          const latestAttempts = {};
           
            // Process all rows to find the latest attempts
            $('tr.trbgc').each((i, el) => {
                const subjectCode = $(el).find('td').eq(0).text().trim() || $(el).find('td').eq(0).text().trim().split(' ')[3];
                // console.log(subjectCode);
                const grade = $(el).find('td').eq(2).text().trim();
                const year = parseInt($(el).find('td').eq(3).text().trim());

                if (grades.hasOwnProperty(grade)) {
                    if (!latestAttempts[subjectCode] ) {
                        latestAttempts[subjectCode] = { grade, year };
                        // console.log(`${subjectCode}, ${year}: ${grade}`);
                    }
                }
            });
            $('tr.selectbg').each((i, el) => {
                const subjectCode = $(el).find('td').eq(0).text().trim().split(' ')[3];
                // console.log(subjectCode);
                const grade = $(el).find('td').eq(1).text().trim();
                const year = parseInt($(el).find('td').eq(2).text().trim());

                

                if (grades.hasOwnProperty(grade)) {
                    if ( latestAttempts[subjectCode].year < year && grade !== 'MC') {
                        latestAttempts[subjectCode] = { grade, year };
                        // console.log(`${subjectCode}, ${year}: ${grade} ss`);
                    }
                }
            });
          
          
            for (const [subjectCode, { grade, year }] of Object.entries(latestAttempts)) {

                // console.log(`${subjectCode}, ${year}: ${grade}`);
                if (nonCreditSubjects.includes(subjectCode)) continue;
                const lastChar = subjectCode.slice(-1);
                let credit;

                switch (lastChar) {
                    case '0':
                        credit = 0;
                        break;
                    case '1':
                        credit = 1;
                        break;
                    case '2':
                        credit = 2;
                        break;
                    case '3':
                        credit = 3;
                        break; 
                    case '4':
                        credit = 4;
                        break;
                    case '5':
                        credit = 5;
                        break;
                    case '6':
                        credit = 6;
                        break;        
                    case 'α':
                        credit = 1.5;
                        break;
                    case 'β':
                        credit = 2.5;
                        break;
                    case 'δ':
                        credit = 1.25;
                        break;
                    
                }

                totalCredits += credit;
                totalGradePoints += grades[grade] * credit;

                switch (true) {
                    case subjectCode.startsWith('AMT'):
                    case subjectCode.startsWith('IMT'):
                    case subjectCode.startsWith('MAT'):
                        mathCredits += credit;
                        mathGradePoints += grades[grade] * credit;
                        break;
                    case subjectCode.startsWith('CHE'):
                        chemCredits += credit;
                        chemGradePoints += grades[grade] * credit;
                        break;
                    case subjectCode.startsWith('PHY'):
                        phyCredits += credit;
                        phyGradePoints += grades[grade] * credit;
                        break;
                    case subjectCode.startsWith('ZOO'):
                        zooCredits += credit;
                        zooGradePoints += grades[grade] * credit;
                        break;
                    case subjectCode.startsWith('BOT'):
                        botCredits += credit;
                        botGradePoints += grades[grade] * credit;
                        break;
                    case subjectCode.startsWith('COM'):    
                        csCredits += credit;
                        csGradePoints += grades[grade] * credit;
                        break;
                }    

                // console.log(`${subjectCode}, ${year}: ${grade}`);
            }
          
          const gpa = totalGradePoints / totalCredits;
          const mathGpa = mathGradePoints / mathCredits;
          const chemGpa = chemGradePoints / chemCredits;
          const phyGpa = phyGradePoints / phyCredits;
          const zooGpa = zooGradePoints / zooCredits;
          const botGpa = botGradePoints / botCredits;
          const csGpa = csGradePoints / csCredits;
          
          
        // console.log(response);
        
        
        const result = {
          data,
          gpa: gpa.toFixed(2),
          mathGpa: mathGpa.toFixed(2),
          cheGpa: chemGpa.toFixed(2),
          phyGpa: phyGpa.toFixed(2),
          zooGpa: zooGpa.toFixed(2),
          botGpa: botGpa.toFixed(2),
          csGpa: csGpa.toFixed(2) 
        };
        // console.log(result);

      res.json(result);
    } catch (error) {
        res.status(500).send('Error fetching data');
    }
});

;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
