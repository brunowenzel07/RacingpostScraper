const tress = require('tress');
const needle = require('needle');
const cheerio = require('cheerio');
const resolve = require('url').resolve;
const fs = require('fs');
const colors = require('colors');
const json2xls = require('json2xls');


console.time("App worked: ".grey);

let count = 0;
const results = [];
const exceptionCities = [
  'Ballinrobe',
  'Bellewstown',
  'Clonmel',
  'Cork',
  'Curragh',
  'Down Royal',
  'Downpatrick',
  'Dundalk',
  'Dundalk',
  'Fairyhouse',
  'Galway',
  'Gowran Park',
  'Kilbeggan',
  'Killarney',
  'Laytown',
  'Leopardstown',
  'Limerick',
  'Limerick Junction',
  'Listowel',
  'Mallow',
  'Naas',
  'Navan',
  'Phoenix Park',
  'Punchestown',
  'Roscommon',
  'Sligo',
  'Thurles',
  'Tipperary',
  'Tralee',
  'Tramore',
  'Wexford',
].map(item => item.toLowerCase());

const weekdays = new Array(7);
weekdays[0] = "Sunday";
weekdays[1] = "Monday";
weekdays[2] = "Tuesday";
weekdays[3] = "Wednesday";
weekdays[4] = "Thursday";
weekdays[5] = "Friday";
weekdays[6] = "Saturday";

const months = new Array(12);
months[0] = "Jan";
months[1] = "Feb";
months[2] = "Mar";
months[3] = "Apr";
months[4] = "May";
months[5] = "Jun";
months[6] = "Jul";
months[7] = "Aug";
months[8] = "Sep";
months[9] = "Oct";
months[10] = "Nov";
months[11] = "Dec";



let targetDateFormatted = process.argv[2];
let targetDate;
// are we scraping future racecards or results from the past?
// this is defined later when scraper first collects links
let isFuture = true;

// if no date provided => use tomorrow's date
if (targetDateFormatted === undefined) {

  // manually generate tomorrow's date
  targetDate = new Date();
  targetDate.setDate(new Date().getDate() + 1);
  targetDateFormatted = targetDate.getFullYear()
    + '-' + leadingZero(targetDate.getMonth() + 1)
    + '-' + leadingZero(targetDate.getDate());

  console.log(`Tip: type 'node app.js 2017-02-23' to use custom date.`.grey);
  console.log(`No date provided. Tomorrow's date used: `.grey + `${targetDateFormatted}`.white);

} else {
  targetDate = new Date(targetDateFormatted);
  console.log(`Input date: ${targetDateFormatted}`);
}

const dataPath = './data-' + targetDateFormatted + '-' + weekdays[targetDate.getDay()] + '.xls';

const URL = `https://www.racingpost.com/racecards/${targetDateFormatted}/time-order`;














// main scraper queue handler function
const q = tress(function (job, cb) {
  needle.get(job.url, function (err, res) {




    // if there was an error while GETting url, then wait for 1 sec and retry
    if (err || res.statusCode !== 200) {
      console.error(`${(err || res.statusCode)}. Paused for 1 sec. (${job.url})`.red);
      return cb(true); // place url in the beginning of the queue
    }

    // parse DOM
    const $ = cheerio.load(res.body);

    // flag for logging omitted horses
    let nothingInteresting = true;


    // smallest jQuery plugin ever! :)
    $.prototype.sort = [].sort;

    // custom jQuery plugin
    // usage: [1, 2, 3, 4].atLeastOne( it => it === 2) returns [1, 2, 3, 4]
    //        [1, 2, 3, 4].atLeastOne( it => it === 5) returns []
    $.prototype.atLeastOne = function (testFunction) {
      return Array.prototype.some.call(this, function (it) {
        return testFunction(it);
      }) ? this : $([]); // $([]) because $([]).each(...) exists and [].each(...) doesn't
    };








    // HANDLE MEETING
    if (job.type === 'meeting') {


      let date = targetDateFormatted;
      let time = $(isFuture ? '.RC-courseHeader__time' : '.rp-raceTimeCourseName__time').text().trim();
      let meeting = $(isFuture ? '.RC-courseHeader__name' : '.rp-raceTimeCourseName__name').text().trim();
      let descr = $(isFuture ? '.RC-cardHeader__courseDetails' : '.rp-raceTimeCourseName__info_container').text().trim();
      descr.toLowerCase();
      let currentDistance = $(isFuture ? '.RC-cardHeader__distance' : '.rp-raceTimeCourseName_distance').text().trim().toLowerCase();
      let targetType = 'FLAT';


      if (!!~descr.indexOf('hurdle') || !!~descr.indexOf('chase')) {
        targetType = 'JUMP';
      }

      // construct boundary distances used for further checking on DISTANCE condition
      const { leftDistance, middleDistance, rightDistance } = closeDistances(currentDistance);;


      let horseTableRows = $(isFuture ?
        '.RC-runnerRowWrapper .RC-glanceRunnerRow:not(".RC-glanceRunnerRow_disabled")' :
        '.rp-horseTable__table .rp-horseTable__mainRow');

      horseTableRows.each(function () {
        // for every table row
        try { // if can't parse something => omit row

          let horseName = $(this).find(isFuture ? '.RC-glanceRunner__name' : 'a.rp-horseTable__horse__name').text().trim();
          let cdbf = isFuture ? $(this).find('.RC-glanceRunner__cdbf').text().trim().toUpperCase() : '?';
          let targetOR = +$(this).find(isFuture ? '.RC-glanceRunner__or' : 'td[data-ending="OR"]').text().trim();
          let horseCardURL = $(this).find(isFuture ? '.RC-glanceRunner__name' : 'a.rp-horseTable__horse__name').attr('href');
          let sp = '?';
          let opened = '?';


          if (isNaN(targetOR)) return omitHorse(date, time, meeting, horseName);


          if (isFuture) {

            cdbf = cdbf.replace(/\s+/, ' '); // replace whitespaces with one space
            let isC = !!~cdbf.indexOf('C');

            if (!isC) return omitHorse(date, time, meeting, horseName);

          } else {
            sp = $(this).find('.rp-horseTable__horse__price').text().trim();

            let commentRow = $(this).next().next().text().trim().toLowerCase();
            let opMatches = commentRow.match(/\(op (.*)\)/);
            opened = opMatches ? opMatches[1] : sp;
          }

          // form special link containing horse's info
          let horseNumber = horseCardURL.slice(15);
          horseNumber = horseNumber.slice(0, horseNumber.indexOf('#'));
          const horseURL = `/profile/horse/tabs/${horseNumber}/form/horse/0/0/0/desktop`;


          const horse = {
            'date': date,
            'time': time,
            'meeting': meeting,
            'horseName': horseName,
            'CDBF': cdbf,
            'targetOR': targetOR,
            'targetType': targetType,
            'sp': sp,
            'opened': opened,
            'leftDistance': leftDistance,
            'rightDistance': rightDistance,
            'middleDistance': middleDistance,
          };

          // put horse in the head of the queue
          q.unshift({
            'type': 'horse',
            'url': resolve(URL, horseURL),
            'horse': horse,
          });

        } catch (e) { }

      });

    }





    // HANDLE SINGLE HORSE
    if (job.type === 'horse') {


      let formTable = $('.hp-formTable tr.js-sortableTable__row')
        // WINNER condition
        .filter(function () {
          return $(this).find('.hp-formTable__position').text().trim() === '1';
        })
        // COURSE/MEETING condition
        .atLeastOne(function (it) {
          return $(it).find('.hp-formTable__abbr').attr('data-course').trim().toLowerCase() === job.horse.meeting.toLowerCase();
        })
        // DATE condition
        .filter(function () {
          let itemTableDate = $(this).find('a[data-test-selector="item-table-date"]').text().trim();
          // added 3 hours because 
          // 1) 01Jan16 < 2016-01-01 gives true
          // 2) new Date('01Jan16')    => Fri Jan 01 2016 00:00:00 GMT+0200 (EET)
          //    new Date('2016-01-01') => Fri Jan 01 2016 02:00:00 GMT+0200 (EET)
          //    ??? (maybe bug)                            ^
          let isProperDate = new Date(new Date(itemTableDate).getTime() + 3 * 60 * 60 * 1000) < targetDate;
          return isProperDate;
        })
        // OR must be a number
        .filter(function () {
          return !isNaN(+$(this).find('td:nth-child(9)').text().trim());
        })
        // OR condition
        .filter(function () {
          return +$(this).find('td:nth-child(9)').text().trim() >= job.horse.targetOR - 1;
        })
        // SORT by OR
        .sort(function (a, b) {
          let ORa = +$(a).find('td:nth-child(9)').text().trim();
          let ORb = +$(b).find('td:nth-child(9)').text().trim();
          return ORb > ORa;
        });
      // LOOP through each remaining row
      formTable.each(function (index) {

        nothingInteresting = false;

        let itemTableOR = +$(this).find('td:nth-child(9)').text().trim();
        let itemTableClass = $(this).find('[data-test-selector="item-table-class"]').text().trim().toLowerCase();
        let itemTableDistance = $(this).find('[data-test-selector="item-table-distance"]').text().trim().toLowerCase();
        let itemTableMeeting = $(this).find('.hp-formTable__abbr').attr('data-course').trim().toLowerCase();

        // define current TYPE of race
        // 'NvCh', 'NvH', 'HcCh' and 'HcH' means JUMP
        let currentType =
          !!~itemTableClass.indexOf('nvch') ||
            !!~itemTableClass.indexOf('nvh') ||
            !!~itemTableClass.indexOf('hcch') ||
            !!~itemTableClass.indexOf('hch') ?
            'JUMP' : 'FLAT';

        // SAME TYPE flag
        let isSameType = job.horse.targetType === currentType;

        // CLOSE MATCH flag
        let isCloseMatch = itemTableOR === job.horse.targetOR - 1;

        // SAME COURSE/MEETING flag
        let isSameMeeting = itemTableMeeting === job.horse.meeting.toLowerCase();

        // SAME DISTANCE tag 
        let isSameDistance =
          itemTableDistance === job.horse.leftDistance ||
          itemTableDistance === job.horse.middleDistance ||
          itemTableDistance === job.horse.rightDistance;




        function proceedHorse() {
          saveHorse({
            'DATE': job.horse.date,
            'TIME': job.horse.time,
            'MEETING': job.horse.meeting,
            'TARGET TYPE': job.horse.targetType,
            'HORSE': job.horse.horseName,
            'SP': job.horse.sp,
            'OPENED': job.horse.opened,
            'CDBF': job.horse.CDBF,
            'TARGET OR': job.horse.targetOR,
            'CURRENT OR': itemTableOR,
            'CLOSE MATCH': isCloseMatch,
            'CURRENT TYPE': currentType,
            'SAME TYPE': isSameType,
          });
        }



        if (isSameMeeting && isSameDistance) {
          job.horse.CDBF = 'CD';
          proceedHorse();
          return false; // to break the $.each loop
        }

        if (isSameDistance) {
          job.horse.CDBF = 'C,D';
          proceedHorse();
          return false;
        }

        // last item
        if (index + 1 === formTable.length) {
          job.horse.CDBF = 'C';
          proceedHorse();
          return false;
        }


      });

    }






    if (nothingInteresting && job.type === 'horse') {
      omitHorse(job.horse.date, job.horse.time, job.horse.meeting, job.horse.horseName);
    }

    return cb();
  });
}, 1); // run in %second_param% parallel threads (or -%second_param% ms delay)








// retry request if there was an error
q.retry = function () {
  q.pause();
  // console.log('Paused on:', this);
  setTimeout(function () {
    q.resume();
    console.log('Resumed.'.green);
  }, 1000);
}





// on finish
let timerFinish;
q.drain = function () {

  if (!timerFinish) {
    timerFinish = setTimeout(function () {

      console.timeEnd("App worked: ".grey);

      if (results.length === 0) {
        console.log("Nothing to save.".red);
        return;
      }

      const xls = json2xls(results);

      try {
        fs.writeFileSync(dataPath, xls, 'binary');
      } catch (e) {
        console.log("Error while writing file ".red + dataPath.red);
        return;
        // process.exit(1);
      }

      console.log(dataPath.green + " file saved.".green);

    }, 2500);
  }
}






// setup scraper
needle.get(URL, { follow_max: 1 }, function (err, res) {
  if (err) throw err;

  const $ = cheerio.load(res.body);

  console.log(`racingpost.com recognized the date as `.grey + `${isFuture ? 'future' : 'past'}`.white);
  console.log("Collecting links...");
  // console.log(res);



  $.fn.reverse = [].reverse; // another smallest jQuery plugin! :)

  let cards = $(isFuture ?
    '.RC-meetingList_byTime .RC-meetingItem_horses' :
    '.rp-timeView__list .rp-timeView__listItem');

  let numberOfRows = cards.length;

  cards = isFuture ? cards : cards.reverse();

  // cards = $([]);
  // q.push({
  //   'type': 'meeting',
  //   'url': 'https://www.racingpost.com/racecards/47/redcar/2017-06-24/677099/at-a-glance',
  // });


  cards.each(function (index) {
    let city = $(this).find(isFuture ? 'span.RC-meetingItem__title' : '.rp-timeView__raceName').text().trim().toLowerCase();
    let description = $(this).find(isFuture ? 'span.RC-meetingItem__info' : '.rp-timeView__raceTitle').text().trim().toLowerCase();

    let countryCodeMatches = city.match(/(.*)\s(\(.*\))/);
    let isCountryCode = countryCodeMatches && countryCodeMatches[2] !== '(aw)';
    city = (countryCodeMatches && countryCodeMatches[2] === '(aw)') ? countryCodeMatches[1] : city;
    let isCityAppropriate = !~exceptionCities.indexOf(city);
    let isHandicap = !!~description.indexOf('handicap');
    let isAmateur = !!~description.indexOf('amateur');

    if (isCityAppropriate && !isCountryCode && isHandicap && !isAmateur) {
      let url = $(this).find(isFuture ? 'a.RC-meetingItem__link' : 'a.rp-timeView__raceTitle__link').attr('href');
      url += isFuture ? '/at-a-glance' : '';
      url = resolve(URL, url);
      q.push({
        'type': 'meeting',
        'url': url,
      });
      console.log(url.grey);
    }

    if (index + 1 === numberOfRows) {
      // all links collected, continue
      console.log(`\nCOUNT: DATE | TIME | MEETING | TAR. TYPE | HORSE | SP | `.bgWhite.black
        + `OPENED | CDBF | TAR. OR | CUR. OR | CLOSE MATCH | CUR. TYPE | SAME TYPE`.bgWhite.black);
    }
  });


  // console.log("Starting scraper...".grey);
  // // console.log("LENGTH = " + q.length());
}).on('redirect', function (location) {
  // event 'redirect' was fired
  // redirected from https://www.racingpost.com/racecards/2017-02-23/time-order
  // to              https://www.racingpost.com/results/2017-02-23/time-order
  // so the date was recognized as PAST
  isFuture = false;
});




// format date segments to 2 digits
function leadingZero(value) {
  if (value < 10) {
    return "0" + value.toString();
  }
  return value.toString();
}



// save horse
// (i.e. DATE, TIME, MEETING, HORSE, RC-glanceRunner__cdbf, iTARGET_OR, current OR, bCLOSE_MATCH)
function saveHorse(it) {
  results.push(it);
  ++count;
  console.log(`${leadingZero(count)}: ${it['DATE']} | ${it['TIME']} | ${it['MEETING']} | ${it['TARGET TYPE']} | ${it['HORSE']} `.cyan
    + `| ${it['SP']} | ${it['OPENED']} | ${it['CDBF']} | ${it['TARGET OR']} | ${it['CURRENT OR']} | ${it['CLOSE MATCH']} `.cyan
    + `| ${it['CURRENT TYPE']} | ${it['SAME TYPE']}`.cyan);
}



function omitHorse(date, time, meeting, horseName) {
  console.log(`    ${date} | ${time} | ${meeting} |      | ${horseName} `.grey);
}




// 2m1½f (2 miles and 1,5 furlongs - Irish metric system)
// 1 Irish mile = 8 Irish furlongs = 320 Irish perches = 2240 Irish yards
// 2m1.5f += 0.5f are considered same distances in our case
// i.e. 2m1f ~ 2m1.5f ~ 2m2f
function closeDistances(mainDistance) {
  let milesMatches = mainDistance.match(/(\d+)m/);
  let furlongsMatches = mainDistance.match(/m(.*)f/) || mainDistance.match(/(.*)f/);
  let miles = milesMatches === null ? 0 : +milesMatches[1];
  let furlongs = furlongsMatches === null ? '0' : furlongsMatches[1];
  furlongs = +furlongs.replace('½', '.5');

  let leftFurlongs = furlongs - 0.5;
  let rightFurlongs = furlongs + 0.5;
  let leftMiles = miles;
  let rightMiles = miles;


  if (areEqual(leftFurlongs, -0.5)) {
    leftMiles--;
    leftFurlongs = 7.5;
  }

  if (areEqual(leftFurlongs, 8)) {
    leftMiles++;
    leftFurlongs = 0;
  }

  if (areEqual(rightFurlongs, -0.5)) {
    rightMiles--;
    rifgfrightFurlongs = 7.5;
  }

  if (areEqual(rightFurlongs, 8)) {
    rightMiles++;
    rightFurlongs = 0;
  }

  let leftDistance = (leftMiles > 0.0000001 ? leftMiles + 'm' : '') + (leftFurlongs > 0.0000001 ? leftFurlongs + 'f' : '');
  leftDistance = leftDistance.replace('0.5', '½').replace('.5', '½');

  let rightDistance = (rightMiles > 0.0000001 ? rightMiles + 'm' : '') + (rightFurlongs > 0.0000001 ? rightFurlongs + 'f' : '');
  rightDistance = rightDistance.replace('0.5', '½').replace('.5', '½');

  // console.log(`${ mainDistance }: ${ leftDistance } < ${ mainDistance } < ${ rightDistance }`);

  const middleDistance = mainDistance;

  return { leftDistance, middleDistance, rightDistance };
}


// instead of (floatVar === 0.3)
// we use     (abs(floatVar - 0.3) < 0.0000001)
// because that's how floating-point numbers work in JS
function areEqual(firstFloat, secondFloat) {
  return Math.abs(firstFloat - secondFloat) < 0.0000001;
}





// TEST CASES
// [
//   '1f',
//   '1½f',
//   '6f',
//   '7f',
//   '7½f',
//   '1m',
//   '1m½f',
//   '1m1f',
//   '1m1½f',
//   '1m6½f',
//   '1m7f',
//   '1m7½f',
//   '2m',
//   '2m½f',
//   '2m2f',
//   '2m7f',
//   '2m7½f',
//   '3m',
//   '3m½f',
//   '9m½f',
//   '10m',
//   '10m½f',
//   '10m1f',
//   '10m1½f',
//   '99m7½f',
//   '100m',
//   '100m½f',
// ].forEach(distance => console.log(closeDistances(distance)));

