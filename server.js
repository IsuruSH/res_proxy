import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import * as cheerio from 'cheerio';


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
const noAccessStnum = ['12419', '12391', '12428', '12439', '12373']; // Add the student numbers that should receive "No access" notification


app.get('/results', async (req, res) => {
    const { stnum, rlevel } = req.query;
    const strippedStnum = stnum.startsWith(9) ? stnum.slice(1) : stnum;

    // Check if the stripped student number is in the no access list
    if (noAccessStnum.includes(strippedStnum) && !stnum.startsWith(9)) {
        return res.status(403).json({ message: 'No access to results for this student number' });
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
          
          $('tr.trbgc').each((i, el) => {
            const subjectCode = $(el).find('td').eq(0).text().trim();
            const grade = $(el).find('td').eq(2).text().trim();
            // console.log(`${subjectCode}: ${grade}`);
          
            if (grades.hasOwnProperty(grade)) {
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
                    case 'α':
                        credit = 1.5;
                        break;
                    case 'β':
                        credit = 2.5;
                        break;
                    case 'δ':
                        credit = 1.25;
                        break;
                    default:
                        credit = 1;
                        break;
                }

                totalCredits += credit;
                totalGradePoints += grades[grade] * credit;
            }
          });
          
          const gpa = totalGradePoints / totalCredits;
          
          
        // console.log(response);
        
        
        const result = {
          data,
          gpa: gpa.toFixed(2)
      };

      res.json(result);
    } catch (error) {
        res.status(500).send('Error fetching data');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
