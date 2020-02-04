const utils = require('./utils')
const DataURI = require('datauri')
const adpu = require('./adpu')
const datauri = new DataURI()

const STATUS = {
  START: 'START',
  READING: 'READING',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR'
}

const parseDateToString = (date) => {
  return `${parseInt(date.slice(0, 4) - 543)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

const readData = async (reader, protocol, withPhoto, callback) => {
  let totalStep = 4
  
  if(withPhoto) {
    totalStep = 4 + adpu.CMD_GET_PHOTO.length
  }

  try {
    // Select
    callback({ status: STATUS.START })
    await sendCommand(reader, adpu.CMD_SELECT, protocol)

    // Get Data
    const citizenId = await sendCommand(reader, adpu.CMD_CID, protocol)
    callback({ status: STATUS.READING, obj: { step: 1, of: totalStep, message: 'citizen_id' }})

    const rawPersonalInfo = await sendCommand(reader, adpu.CMD_PERSON_INFO, protocol)
    callback({ status: STATUS.READING, obj: { step: 2, of: totalStep, message: 'personal_info' }})

    const rawAddress = await sendCommand(reader, adpu.CMD_ADDRESS, protocol)
    callback({ status: STATUS.READING, obj: { step: 3, of: totalStep, message: 'address' }})

    const rawIssueExpire = await sendCommand(reader, adpu.CMD_ISSUE_EXPIRE, protocol)
    callback({ status: STATUS.READING, obj: { step: 4, of: totalStep, message: 'issue_expire' }})

    let data = {}
    data.citizenId = citizenId
    
    
    const thaiName = rawPersonalInfo.substr(0, 100).trim().split('#');
    const englishName = rawPersonalInfo.substr(100, 100).trim().split('#');

    data.titleTH = thaiName[0]
    data.firstNameTH = thaiName[1]
    data.lastNameTH = thaiName[3]
    data.titleEN = englishName[0]
    data.firstNameEN = englishName[1]
    data.lastNameEN = englishName[3]
    
    const tempBirthday = rawPersonalInfo.substr(200, 8)
    data.birthday = parseDateToString(tempBirthday)

    const gender = rawPersonalInfo.substr(208, 1)
    if(gender === '1') {
      data.gender = 'male'
    }
    else  if(gender === '2') {
      data.gender = 'female'
    }
    else {
      data.gender = 'other' 
    }

    const tempAddress = rawAddress.split('#')
    console.log(tempAddress)
    data.address = tempAddress.filter(o => o !== '').join(' ').trim()
    data.addrHouseNo = tempAddress[0]
    data.addrVillageNo = tempAddress[1]
    data.addrTrok = tempAddress[2]
    data.addrAlley = tempAddress[3]
    data.addrRoad = tempAddress[4]
    data.addrTambol = tempAddress[5]
    data.addrAmphur = tempAddress[6]
    data.addrProvince = tempAddress[7]

    data.issue = parseDateToString(rawIssueExpire.slice(0, 8))
    data.expire = parseDateToString(rawIssueExpire.slice(8, 16))

    if(withPhoto) {
      const rawPhoto = await readPhoto(reader, protocol, (step) => {
        callback({ status: STATUS.READING, obj: { step: 4 + step, of: totalStep, message: 'photo' }})
      })

      const encodedData = datauri.format('.jpg', rawPhoto)
      data.photo = encodedData.content
    }
    
    callback({ status: STATUS.COMPLETE, obj: data})
  } 
  catch(e) {
    callback({ status: STATUS.ERROR, obj: e})
  }

  reader.disconnect(reader.SCARD_LEAVE_CARD, err => {
      if (err) {
          return
      }
  })
}

const readPhoto = async (reader, protocol, progress) => {
  let bufferList = []
  for(let i in adpu.CMD_GET_PHOTO) {
    await transmit(reader, adpu.CMD_GET_PHOTO[i][0], protocol)

    let result = await transmit(reader, adpu.CMD_GET_PHOTO[i][1], protocol)
    if (result.length > 2) {
      result = result.slice(0, -2)
    }

    bufferList.push(result)
    progress(bufferList.length)
  }

  const tempBuffer = Buffer.concat(bufferList)
  return tempBuffer
}

const sendCommand = async (reader, command, protocol) => {
  let data = null
  for(let i in command) {
    data = await transmit(reader, command[i], protocol)
  }
  return utils.hex2string(data.toString('hex'))
}

const transmit = async (reader, command, protocol) => {
  return new Promise((resolve, reject) => {
    reader.transmit(Buffer.from(command), 256, protocol, (err, data) => {
      if(err) {
        reject(err)
      }
      else {
        resolve(data)
      }
    })
  })
}

module.exports = {
  readData,
  STATUS
}
