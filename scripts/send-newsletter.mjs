console.log("===== Medtronic_ENT 최종 버전 스크립트 실행 (다른 코드 절대 아님) =====");
// import { PrismaClient } from '@prisma/client'; 삭제
import 'dotenv/config';
import axios from 'axios';
import { sendEmail } from './utils/email.mjs';

// 네이버 API 설정
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// 검색 키워드 카테고리
const SEARCH_KEYWORDS = {
  '귀(이과)': ['"돌발성"&난청', '"난청"&치료', '"난청"&인공와우', '"인공와우"&개발', '"노인성"&난청', '"중이염"&항생제', '"난청"&진단'],
  '코(비과)': ['"부비동염"&수술','"부비동염"&비수술','"알레르기성비염"&치료','비중격만곡증','"비강"&스테로이드'],
  '목(두경부)': ['"성대"&질환', '"후두암"&AI', '수면무호흡', '"두경두암"&병원원'],
  '보험 및 정책': ['"인공와우"&보험','"난청"&장애','"편도수술"&수가','"비중격수술"&실손보험','청각장애&병원','"아데노이드"&절제술','"수면무호흡"&급여화','"이비인후과"&로봇수술','후두내시경&검사','후두내시경&병원','청각&재활','알레르기&면역치료','부비동&수술','이비인후과&개원','이비인후과&의료소송']

};

// 하드코딩된 구독자 목록
const subscribers = [
  { email: 'gkstmdgus99@gmail.com', name: '한승현', position: '이사', department: '기획', company: '코리아메드인포' },
  { email: 'jack.jung@medtronic.com', name: '정종원', position: '부장', company: '메드트로닉' },

];

// 30일 이내 뉴스인지 확인 (24시간에서 변경)
function isWithin30Days(pubDate) {
  const newsDate = new Date(pubDate);
  const now = new Date();
  const daysDiff = (now.getTime() - newsDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff <= 30;
}

// 불필요한 기사 필터링 함수
function filterUnwantedArticles(article) {
  const title = cleanText(article.title).toLowerCase();
  const description = cleanText(article.description).toLowerCase();
  
  // 제외할 키워드들
  const excludeKeywords = [
    '광고', '홍보', '이벤트', '세일', '할인', '쿠폰', '경품', '추첨',
    '부동산', '주식', '투자', '금융', '보험상품', '대출',
    '연예인', '스타', '유명인', '인스타그램', 'SNS',
    '게임', '스포츠', '축구', '야구', '농구',
    '음식', '맛집', '레시피', '요리',
    '패션', '뷰티', '화장품', '의류',
    '여행', '관광', '호텔', '항공',
    '자동차', '운전', '교통',
    '날씨', '기상', '천재지변',
    '정치', '선거', '여론조사',
    '사회', '사건사고', '범죄', '사고',
    '일반', '기타', '잡지', '매거진'
  ];
  
  // 제외할 언론사들 (필요시 추가)
  const excludeSources = [
    '스포츠', '연예', '엔터테인먼트', '패션', '뷰티', '라이프', '푸드'
  ];
  
  // 제목이나 설명에 제외 키워드가 포함된 경우 필터링
  for (const keyword of excludeKeywords) {
    if (title.includes(keyword) || description.includes(keyword)) {
      return false;
    }
  }
  
  // 언론사가 제외 목록에 포함된 경우 필터링
  const source = article.originallink || '';
  for (const excludeSource of excludeSources) {
    if (source.toLowerCase().includes(excludeSource.toLowerCase())) {
      return false;
    }
  }
  
  // 제목이 너무 짧거나 긴 경우 필터링 (3글자 미만 또는 100글자 초과)
  if (title.length < 3 || title.length > 100) {
    return false;
  }
  
  // 제목에 특수문자가 너무 많은 경우 필터링
  const specialCharCount = (title.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length;
  if (specialCharCount > title.length * 0.3) {
    return false;
  }
  
  return true;
}

// HTML 태그 및 특수문자 제거
function cleanText(text) {
  return text
    .replace(/<\/?[^>]+(>|$)/g, '') // 모든 HTML 태그 제거
    .replace(/&lt;/g, '')
    .replace(/&gt;/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 두 제목의 유사도 검사
function areTitlesSimilar(title1, title2) {
  const words1 = new Set(
    cleanText(title1)
      .split(' ')
      .filter(word => word.length >= 2)
  );
  const words2 = new Set(
    cleanText(title2)
      .split(' ')
      .filter(word => word.length >= 2)
  );

  const commonWords = Array.from(words1).filter(word => words2.has(word));
  return commonWords.length >= 2;
}

// API 호출 사이의 딜레이 함수
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Naver API 호출 최적화
async function getNewsForKeyword(keyword, retryCount = 0) {
  try {
    // API 호출 간 딜레이 (Hiworks 이메일 API와 Naver API 제한을 고려)
    await delay(1000 + Math.random() * 1000); // 1~2초 사이 랜덤 딜레이

    const response = await axios.get(
      'https://openapi.naver.com/v1/search/news.json',
      {
        params: {
          query: keyword,
          display: 5,
          sort: 'date',
        },
        headers: {
          'X-Naver-Client-Id': NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
        },
        timeout: 5000, // 5초 타임아웃 설정
      }
    );

    const recentNews = response.data.items
      .filter(item => isWithin30Days(item.pubDate))
      .filter(filterUnwantedArticles)
      .map(item => ({
        ...item,
        keyword,
        pubDate: new Date(item.pubDate)
      }));

    return recentNews;
  } catch (error) {
    if (retryCount >= 3) {
      console.error(`키워드 "${keyword}" 최대 재시도 횟수(3회) 초과`);
      return [];
    }

    if (error.response?.status === 429) {
      const retryAfter = error.response.headers['retry-after'] || 5;
      console.log(`키워드 "${keyword}" API 제한 도달. ${retryAfter}초 후 재시도...`);
      await delay(retryAfter * 1000);
      return getNewsForKeyword(keyword, retryCount + 1);
    }
    
    const errorMessage = error.response?.data?.errorMessage || error.message;
    console.error(`키워드 "${keyword}" 뉴스 가져오기 실패:`, errorMessage);
    
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      console.log(`네트워크 오류 발생. 2초 후 재시도...`);
      await delay(2000);
      return getNewsForKeyword(keyword, retryCount + 1);
    }
    
    return [];
  }
}

// 뉴스 수집 함수 (변경 없음)
async function getAllNewsArticles() {
  const allArticles = [];
  const seenUrls = new Set();
  const processedArticles = [];

  // 병렬로 모든 키워드에 대한 뉴스를 가져옴
  const categoryPromises = Object.entries(SEARCH_KEYWORDS).map(async ([category, keywords]) => {
    const keywordPromises = keywords.map(keyword => getNewsForKeyword(keyword));
    const keywordResults = await Promise.all(keywordPromises);
    
    const categoryArticles = [];
    
    for (const articles of keywordResults) {
      for (const article of articles) {
        if (seenUrls.has(article.link)) {
          continue;
        }

        let isDuplicate = false;
        for (const processedArticle of processedArticles) {
          if (areTitlesSimilar(article.title, processedArticle.title)) {
            if (article.pubDate > processedArticle.pubDate) {
              const index = processedArticles.indexOf(processedArticle);
              processedArticles.splice(index, 1);
              seenUrls.delete(processedArticle.link);
              break;
            } else {
              isDuplicate = true;
              break;
            }
          }
        }

        if (!isDuplicate) {
          seenUrls.add(article.link);
          processedArticles.push(article);
          categoryArticles.push(article);
        }
      }
    }

    if (categoryArticles.length > 0) {
      categoryArticles.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
      return {
        category,
        articles: categoryArticles
      };
    }
    return null;
  });

  const results = await Promise.all(categoryPromises);
  return results.filter(result => result !== null);
}

// 이메일 발송을 분할 처리하는 함수
async function sendEmailsInBatches(subscribers, htmlContent, batchSize = 50) {
  let successCount = 0;
  let failCount = 0;
  const failedEmails = [];
  
  for (let i = 0; i < subscribers.length; i += batchSize) {
    const batch = subscribers.slice(i, i + batchSize);
    console.log(`배치 ${i / batchSize + 1} 처리 중 (${batch.length}명)`);
    
    for (const subscriber of batch) {
      try {
        console.log(`${subscriber.email}에게 이메일 발송 시도...`);
        const emailResult = await sendEmail({
          to: subscriber.email,
          subject: `[메드트로닉 ENT 뉴스레터] ${new Date().toLocaleDateString('ko-KR')} 뉴스 모음`,
          content: htmlContent,
          saveSentMail: true
        });
        console.log('이메일 발송 결과:', emailResult);
        successCount++;
        
        // Hiworks API 제한을 고려한 딜레이 (초당 1회 미만으로 제한)
        await delay(1200); // 1.2초 딜레이
      } catch (error) {
        failCount++;
        failedEmails.push(subscriber.email);
        console.error(`구독자 ${subscriber.email}에게 발송 실패:`, error);
        
        // 오류 발생 시 잠시 대기
        await delay(3000);
      }
    }
    
    // 배치 간 딜레이 추가
    if (i + batchSize < subscribers.length) {
      console.log(`다음 배치를 위해 5초 대기...`);
      await delay(5000);
    }
  }
  
  return { successCount, failCount, failedEmails };
}

// 뉴스레터 HTML 생성 함수
async function generateNewsletterHTML(newsCategories) {
  const categoriesWithNews = newsCategories.filter(category => 
    category.articles && category.articles.length > 0
  );

  if (categoriesWithNews.length === 0) {
    return null;
  }

  let htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h1 style="color: #333; text-align: center;">이비인후과 의사를 위한 주요 뉴스</h1>
      <p style="color: #666; text-align: center;">최근 30일 동안 이비인후과 연관 뉴스입니다.</p>
        </a>
        <p style="color: #666; font-size: 12px; margin-top: 10px;">
          안녕하세요, 메드트로닉코리아 ENT팀입니다.이비인후과 전문의를 위한 주요 뉴스와 정보를 간략히 정리하여 공유 드립니다.
          국내외 학회 소식, 임상 가이드라인 변화, 최신 수술 기법 및 기술 동향 등 진료와 연구에 도움이 될 수 있는 내용을 중심으로 구성하였습니다.
          또한, 메드트로닉코리아 ENT 제품 관련 데모 요청이나 추가 정보가 필요하신 경우, 언제든지 이메일로 회신 주시면 감사하겠습니다. 항상 진료 현장에서 헌신하시는 선생님들께 진심으로 감사드리며, 앞으로도 더욱 유익한 정보로 찾아 뵙겠습니다.
          감사합니다.
          ※ 본 메일 수신을 원하지 않으시는 경우에도 번거로우시겠지만 이메일로 회신 주시면 정중히 처리해드리겠습니다.
        </p>
      </div>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  `;

  for (const categoryNews of categoriesWithNews) {
    htmlContent += `
      <div style="margin: 20px 0;">
        <h2 style="color: #2c5282; border-bottom: 2px solid #2c5282; padding-bottom: 5px;">
          ${categoryNews.category} (${categoryNews.articles.length}건)
        </h2>
        <ul style="list-style-type: none; padding: 0;">
    `;

    for (const article of categoryNews.articles) {
      const cleanTitle = cleanText(article.title);
      const cleanDescription = cleanText(article.description);

      htmlContent += `
        <li style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 5px; border: 1px solid #e2e8f0;">
          <a href="${article.link}" 
             style="color: #2c5282; 
                    text-decoration: none; 
                    font-weight: bold;
                    font-size: 16px;
                    display: block;
                    margin-bottom: 8px;">
            ${cleanTitle}
          </a>
          <p style="color: #4a5568; 
                    margin: 8px 0; 
                    font-size: 14px;
                    line-height: 1.5;">
            ${cleanDescription}
          </p>
          <div style="display: flex; 
                      justify-content: space-between; 
                      align-items: center;
                      margin-top: 10px;
                      font-size: 12px;
                      color: #718096;">
            <span>${new Date(article.pubDate).toLocaleString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</span>
            <span style="background: #EDF2F7;
                       padding: 2px 8px;
                       border-radius: 12px;
                       font-size: 11px;">
              ${article.keyword}
            </span>
          </div>
        </li>
      `;
    }

    htmlContent += `
        </ul>
      </div>
    `;
  }

  htmlContent += `
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
      <div style="text-align: center; margin-top: 30px; padding: 20px; background: #f8f9fa;">
        <p style="color: #666;">
          본 뉴스레터는 자동으로 생성되었습니다.<br>
        </p>
      </div>
    </div>
  `;

  return htmlContent;
}

// 뉴스레터 발송 함수
async function sendNewsletterToAllSubscribers(newsCategories) {
  try {
    // const subscribers = await prisma.newsSubscriber.findMany(); 삭제 (이미 상단에 하드코딩된 subscribers 사용)
    console.log('구독자 수:', subscribers.length);

    if (subscribers.length === 0) {
      console.log('구독자가 없습니다.');
      return { success: false, message: '구독자가 없습니다.' };
    }

    const htmlContent = await generateNewsletterHTML(newsCategories);
    if (!htmlContent) {
      console.log('최근 30일 동안의 새로운 뉴스가 없습니다.');
      return { success: false, message: '최근 30일 동안의 새로운 뉴스가 없습니다.' };
    }

    console.log('뉴스레터 HTML 생성 완료');

    const { successCount, failCount, failedEmails } = await sendEmailsInBatches(subscribers, htmlContent);

    const resultMessage = `총 ${subscribers.length}명 중 ${successCount}명 발송 성공, ${failCount}명 실패`;
    console.log(resultMessage);
    
    if (failedEmails.length > 0) {
      console.log('실패한 이메일 목록:', failedEmails);
    }

    return { 
      success: true, 
      message: resultMessage,
      failedEmails: failedEmails.length > 0 ? failedEmails : undefined
    };
  } catch (error) {
    console.error('뉴스레터 발송 중 오류 발생:', error);
    throw error;
  }
}

// 메인 함수
async function main() {
  try {
    console.log('뉴스 수집 시작...');
    const newsCategories = await getAllNewsArticles();
    console.log('수집된 뉴스 카테고리:', newsCategories.map(c => ({ 
      category: c.category, 
      articleCount: c.articles.length 
    })));
    
    if (!newsCategories || newsCategories.length === 0) {
      console.log('수집된 뉴스가 없습니다.');
      return;
    }

    const result = await sendNewsletterToAllSubscribers(newsCategories);
    console.log('최종 결과:', result);
  } catch (error) {
    console.error('뉴스레터 처리 중 오류 발생:', error);
    process.exit(1);
  }
}

// 스크립트 실행
main();