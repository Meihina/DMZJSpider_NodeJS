const express = require('express')
const app = express()
const cors = require('cors')
const BodyParser = require('body-parser')
const request = require('request')
const cheerio = require('cheerio')
const fs = require('fs')


app.use(cors({
    methods:['GET','POST'],
    alloweHeaders:['Conten-Type', 'Authorization']
}))
app.use(BodyParser.json())
app.use(BodyParser.urlencoded({ extended: true }))
app.use(express.static('./public'))

const proxy = 5 // 线程数


// ===== 从站点爬下来的神必函数 =====
const getPages = function(p,a,c,k,e,d){
    e = function(c){
        return (c < a ? '' : e(parseInt(c/a))) + ((c=c%a)>35?String.fromCharCode(c+29):c.toString(36))
    }

    if(!''.replace(/^/,String)){
        while(c--){
            d[e(c)]=k[c]||e(c)
        }
        k=[function(e){return d[e]}]
        e=function(){return'\\w+'}
        c=1
    }

    while(c--){
        if(k[c]){
            p=p.replace(new RegExp('\\b'+e(c)+'\\b','g'),k[c])
        }
    }

    return p
}

// ===== 获取该漫画所有漫画章节url以及名字
function getBase(url){
    return new Promise((resolve , reject) => {
        request(url , function (error , response , body) {
            if (!error && response.statusCode == 200) {
                let $ = cheerio.load(body) , unit = []
                $('.cartoon_online_border ul li a').each((index , ele) => {
                    unit.push({
                        name : $(ele).text(),
                        href : `http://manhua.dmzj.com${$(ele).attr('href')}`
                    })
                })

                let mangaName = url.split('\/').pop()

                try{
                    fs.mkdirSync(mangaName , (error) => {
                        if(error){
                            console.log(error)
                        }else{
                            console.log(mangaName + '创建成功')
                        }
                    })
                }catch(err){
                    console.log(mangaName + '已存在')
                }finally{
                    resolve([unit , mangaName])
                }
            }else{
                reject(error)
            }
        })
    })
}

// ===== 获取单话漫画详情 =====
function getDetail(url , name , mangaName){
    return new Promise((resolve , reject) => {
        request(url + '#@page=1', function (error , response , body) {
            if (!error && response.statusCode == 200) {
                // 获取漫画的页数以及主url
                let $ = cheerio.load(body)
                let [count , pages] = (() => {
                    let temp = $('script').html()
                    let reg = /g_max_pic_count\s=\s\d+/ , reg2 = /return\sp}(.+)/
                    let args = temp.match(reg2)[1] , count = temp.match(reg)[0].split(' ')[2]
                    args = '[' + (args.substring(1 , args.length - 2)) + ']'
                    let [p , a , c , k , e , d] = eval(args)
                    return [count , getPages(p , a , c , k , e , d)]
                })()
                pages = pages.split('[')[1].split(']')[0].split('\\').join('').split('\"').join('').split(',')
                resolve([count , pages , name , mangaName])
            }else{
                reject(error)
            }
        })
    })
}

// ===== 下载模块 =====
async function PicDownload(pageCount , pageUrlArray , name , mangaName){
    let SourceUrl = 'http://www.dmzj.com/category'
    function DL(pageUrlArray , name , mangaName){
        return new Promise((resolve , reject) => {
            request({
                url : 'http://images.dmzj.com/' + pageUrlArray[i],
                headers : {
                    'referer' : SourceUrl,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Safari/537.36',
                },
                timeout : 10000
            } , (error) => {
                if (error) {
                    console.log(error)
                    resolve(name + ' ' + i + '.jpg 下载失败(资源请求超时)')
                }
            }).pipe(
                fs.createWriteStream('./' + mangaName + '/' + name + '/' + i + '.jpg' , {autoClose : true}).on('close' , (err) => {
                    if(err){
                        reject('failed.',err)
                    }else{
                        resolve(`${mangaName} ${name} ${i}.jpg had been saved.`)
                    }
                })
            )
        })
    }

    try{
        fs.mkdirSync('./' + mangaName + '/' + name , (error) => {
            if(error){
                console.log(error)
            }else{
                console.log(name + '创建成功')
            }
        })

        for(var i = 0 ; i < pageCount ; i++){
            let info = await DL(pageUrlArray , name , mangaName)
            console.log(info)
        }
    }catch(err){
        console.log(name + '已存在')
    }finally{
        console.log(name + '下载完毕')
    }
}

app.post('/main' , (req) => {
    console.log(req.body.url)
    getBase(req.body.url).then((data) => {
        (async function(data){
            for(var i = 0 ; i < data[0].length ; i += proxy){
                let proxy_tmp = data[0].length - i < 5 ? data[0].length - i : proxy

                let PicData = await Promise.all((() => {
                    let res = []
                    for(var j = 0 + i ; j < proxy_tmp + i ; j++){
                        res.push(getDetail(data[0][j].href , data[0][j].name , data[1]))
                    }
                    return res
                })())

                await Promise.all((() => {
                    let res = []
                    for(var j = 0 ; j < proxy_tmp ; j++){
                        res.push(PicDownload(PicData[j][0] , PicData[j][1] , PicData[j][2] , PicData[j][3]))
                    }
                    return res
                })())
            }
            console.log('全部下载完毕，下一个!')
        })(data)
    })
})

app.listen(4000 , () => {
    console.log('Project is running in ' + 'http://localhost:4000/index.html')
})