import fetch from 'node-fetch';
import { load } from 'cheerio';

// ====================== 【新手仅需修改这里的2项，其他内容一律不要动】 ======================
const GEMINI_API_KEY = "AIzaSyC0AGyF5aIYhem6zFI0lBan2262KK8L7aI";
const FEISHU_WEBHOOK = "https://open.feishu.cn/open-apis/bot/v2/hook/d156b4ff-2867-4538-8da1-2fedf6a3f3a1";
// 触发关键词，你可以自己修改、添加，用英文逗号隔开
const TRIGGER_KEYWORDS = ["更新资讯", "来份资讯", "推送", "最新资讯", "资讯简报"];
// ==========================================================================================

// 【全网公认最权威AI资讯源】和原来完全一致，不用改
const NEWS_SOURCES = [
  { name: "量子位", url: "https://www.qbitai.com/", selector: ".article-item .article-title a", limit: 4 },
  { name: "机器之心", url: "https://www.jiqizhixin.com/columns/latest", selector: ".article-item .article__title a", limit: 4 },
  { name: "36氪AI板块", url: "https://36kr.com/channel/ai", selector: ".article-flow-item .article-item-title a", limit: 3 },
  { name: "InfoQ AI", url: "https://www.infoq.cn/topic/ai", selector: ".article-list .article-title a", limit: 3 },
  { name: "虎嗅科技", url: "https://www.huxiu.com/channel/tech", selector: ".article-item .article-title a", limit: 2 },
  { name: "钛媒体AI", url: "https://www.tmtpost.com/column/ai", selector: ".post-item .post-title a", limit: 2 },
  { name: "MIT科技评论", url: "https://www.technologyreview.com/topic/ai/", selector: ".teaserItem__title a", limit: 3 },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/", selector: ".article-title a", limit: 3 },
  { name: "Hugging Face", url: "https://huggingface.co/blog", selector: ".blog-post-card h3 a", limit: 2 },
  { name: "arXiv AI论文", url: "https://arxiv.org/list/cs.AI/recent", selector: ".list-title a", limit: 2 },
];

// 核心爬取+总结+推送函数（和原来完全一致，不用改）
async function generateAndPushNews() {
  console.log("=== 开始执行AI资讯爬取任务 ===");
  let allNewsContent = "";

  // 1. 批量爬取资讯
  for (const source of NEWS_SOURCES) {
    try {
      const response = await fetch(source.url, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
        timeout: 10000
      });
      if (!response.ok) continue;
      const html = await response.text();
      const $ = load(html);
      const titleElements = $(source.selector).slice(0, source.limit);
      if (titleElements.length === 0) continue;

      allNewsContent += `【${source.name}】\n`;
      titleElements.each((index, element) => {
        const title = $(element).text().trim();
        if (title && title.length > 5) allNewsContent += `- ${title}\n`;
      });
      allNewsContent += "\n";
    } catch (error) {
      console.log(`爬取【${source.name}】失败：${error.message}`);
      continue;
    }
  }

  if (!allNewsContent.trim()) allNewsContent = "今日暂无新的AI资讯，可稍后再试";

  // 2. 调用Gemini总结
  let finalSummary = "";
  try {
    const prompt = `
你是一名专业的AI行业资深分析师，现在需要你把下面的全网最新AI资讯，整理成一篇结构清晰、重点突出、简洁干练的AI资讯简报。
【整理要求】
1.  开头加一句贴合推送时间的问候，比如早8点用「📢 早安！今日AI行业早报，一键速览核心动态」，下午用「📢 最新AI行业动态，一键速览」，晚上用「📢 今日AI行业汇总，核心动态一文看完」
2.  内容分4个固定板块，按优先级排序：【大厂核心动态】【技术与模型突破】【开源与行业资讯】【融资与政策动态】，没有对应内容的板块可以省略
3.  每个板块下的资讯，用● 标注核心要点，单条要点不超过150字，语言简洁，无废话，不重复
4.  重点突出：大模型更新、AI生图/视频工具、Agent应用、多模态技术、开源模型、大厂产品发布、行业政策、重要融资
5.  全程用通顺的中文，专业但不晦涩，适合AI行业从业者阅读，总字数控制在1000字以内
6.  不要添加任何与资讯无关的内容，不要编造信息，严格基于提供的资讯内容整理

【今日最新AI资讯原文】
${allNewsContent}
`;

    const GEMINI_MODEL = "gemini-1.5-flash";
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const geminiResponse = await fetch(geminiApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048, topP: 0.8, topK: 40 }
      }),
      timeout: 15000
    });

    if (!geminiResponse.ok) throw new Error(`Gemini请求失败`);
    const geminiResult = await geminiResponse.json();
    finalSummary = geminiResult?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!finalSummary) throw new Error("Gemini未返回有效内容");
  } catch (error) {
    console.log(`Gemini总结失败：${error.message}`);
    finalSummary = `⚠️ AI总结暂时失败，为你推送原始资讯：\n\n${allNewsContent}`;
  }

  // 3. 推送到飞书
  try {
    await fetch(FEISHU_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "markdown",
        content: { markdown: { title: "📰 AI行业资讯简报", text: finalSummary } }
      }),
      timeout: 10000
    });
    console.log("=== 飞书推送成功 ===");
    return true;
  } catch (error) {
    console.log(`飞书推送失败：${error.message}`);
    return false;
  }
}

// 主函数：新增飞书消息判断，兼容定时/浏览器/飞书对话三种触发方式
export default async function handler(req, res) {
  // 情况1：飞书群内消息触发（用户发关键词）
  if (req.method === "POST") {
    try {
      const body = req.body;
      // 过滤飞书的心跳验证请求
      if (body.type === "url_verification") {
        return res.status(200).json({ challenge: body.challenge });
      }
      // 处理用户发送的消息
      if (body.event?.message?.content) {
        // 解析用户发的文本内容
        const userMessage = JSON.parse(body.event.message.content).text.trim();
        // 判断是否包含触发关键词
        const isTrigger = TRIGGER_KEYWORDS.some(keyword => userMessage.includes(keyword));

        if (isTrigger) {
          // 触发推送，先给用户回复一个正在处理的消息
          await fetch(FEISHU_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              msg_type: "text",
              content: { text: "🔄 正在为你爬取最新AI资讯，3秒后推送..." }
            })
          });
          // 执行完整的推送流程
          const pushSuccess = await generateAndPushNews();
          return res.status(200).send(pushSuccess ? "触发成功" : "触发失败");
        } else {
          // 非触发关键词，给用户回复引导语
          await fetch(FEISHU_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              msg_type: "text",
              content: { text: "🤖 你好！我是AI资讯助手，发送【更新资讯】即可获取最新的AI行业简报~" }
            })
          });
          return res.status(200).send("非触发指令");
        }
      }
    } catch (error) {
      console.log(`飞书消息处理失败：${error.message}`);
      return res.status(200).send("消息处理完成");
    }
  }

  // 情况2：定时任务/浏览器访问触发（原有功能，完全保留）
  const pushSuccess = await generateAndPushNews();
  res.status(pushSuccess ? 200 : 500).send(pushSuccess ? "任务执行成功" : "任务执行失败");
}

// Vercel函数配置
export const config = {
  maxDuration: 60
};