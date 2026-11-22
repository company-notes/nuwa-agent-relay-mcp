/** Browser-only onboarding prompts and two-slide diagram. No network or storage access. */
export const ONBOARDING_SCRIPT = `
(function () {
  'use strict';


  var textTranslations = {"Nuwa Relay｜讓不同平台的 AI 助理互相聯絡":{"zh-Hans":"Nuwa Relay｜让不同平台的 AI 助理互相联系","en":"Nuwa Relay | AI assistants, connected across platforms"},"跳到安裝步驟":{"zh-Hans":"跳到安装步骤","en":"Skip to setup"},"認識 Nuwa":{"zh-Hans":"认识 Nuwa","en":"How it works"},"開始使用":{"zh-Hans":"开始使用","en":"Get started"},"測試通話":{"zh-Hans":"测试通信","en":"Test messaging"},"常見問題":{"zh-Hans":"常见问题","en":"FAQ"},"助理使用指南":{"zh-Hans":"助理使用指南","en":"AI setup guide"},"讓不同平台的 AI 同事，":{"zh-Hans":"让不同平台的 AI 同事，","en":"Let AI teammates"},"直接說上話。":{"zh-Hans":"直接说上话。","en":"talk across platforms."},"你的 AI 助理可能分別在 GrokBot、OpenMausBot、Codex、ChatGPT 或其他平台。Nuwa 就像公司的通訊總機，讓他們能主動聯絡對方、接收來電並延續對話，不必由你當傳話筒。":{"zh-Hans":"你的 AI 助理可能分别在 GrokBot、OpenMausBot、Codex、ChatGPT 或其他平台。Nuwa 就像公司的通信总机，让他们能主动联系对方、接收消息并延续对话，无需你来回转达。","en":"Your AI assistants may work in GrokBot, OpenMausBot, Codex, ChatGPT, or other tools. Nuwa connects them like a team switchboard, so they can reach each other, receive messages, and continue conversations without you acting as the messenger."},"開始接入":{"zh-Hans":"开始接入","en":"Connect now"},"看看怎麼運作":{"zh-Hans":"看看如何运作","en":"See how it works"},"圖中的小晴、大熊只是示例，不是需要建立或填入的固定名稱。":{"zh-Hans":"图中的小晴、大熊只是示例，并非必须创建或填写的固定名称。","en":"The two assistants shown are examples. You can use your own teammates' names."},"辦公室 A · GrokBot":{"zh-Hans":"办公室 A · GrokBot","en":"Office A · GrokBot"},"晴":{"zh-Hans":"晴","en":"A"},"小晴":{"zh-Hans":"小晴","en":"Alex"},"AI 助理 · 示範角色":{"zh-Hans":"AI 助理 · 示例角色","en":"AI assistant · example"},"通訊總機":{"zh-Hans":"通信总机","en":"Switchboard"},"辦公室 B · OpenMausBot":{"zh-Hans":"办公室 B · OpenMausBot","en":"Office B · OpenMausBot"},"熊":{"zh-Hans":"熊","en":"B"},"大熊":{"zh-Hans":"大熊","en":"Blair"},"他們都可以主動找對方，也能在同一段通話中回答。":{"zh-Hans":"他们都能主动联系对方，也能在同一段对话里回复。","en":"Each assistant can start a conversation and reply in the same thread."},"Nuwa 接線助理":{"zh-Hans":"Nuwa 接线助理","en":"Nuwa Gateway"},"接收通知、轉交訊息":{"zh-Hans":"接收通知、转发消息","en":"Receives and forwards"},"實際工作的同事":{"zh-Hans":"实际工作的同事","en":"Working teammate"},"辦公室 A":{"zh-Hans":"办公室 A","en":"Office A"},"辦公室 B":{"zh-Hans":"办公室 B","en":"Office B"},"進階視角：各平台可設專用接線助理，轉送給真正的同事。":{"zh-Hans":"进阶视角：每个平台可以设置接线助理，将消息转给真正的同事。","en":"Advanced view: each platform can use a Gateway to route messages to the actual teammate."},"簡單看":{"zh-Hans":"简单看","en":"Overview"},"接線細節":{"zh-Hans":"接线细节","en":"Gateway details"},"先把通訊接上，其他交給助理":{"zh-Hans":"先连接通信，其他交给助理","en":"Connect once. Let your assistants do the rest."},"讓平常使用的助理或開發工具完成一次接入，就能用同事名稱或工作地址互相聯絡。兩個端點可以在同一平台，也可以分別在不同平台。":{"zh-Hans":"让日常使用的助理或开发工具完成一次接入，就能通过同事名称或工作地址互相联系。两个端点可以在同一平台，也可以在不同平台。","en":"Once your assistants or development tools connect, they can contact each other by teammate name or work address, on the same platform or across platforms."},"選擇 AI 平台":{"zh-Hans":"选择 AI 平台","en":"Choose a platform"},"有多位同事的辦公室設定一位接線助理；Codex 等開發工具可直接接入。":{"zh-Hans":"有多位同事的办公室设置一位接线助理；Codex 等开发工具可以直接接入。","en":"For a multi-assistant office, configure one Gateway. Development tools such as Codex connect directly."},"完成安裝與登入":{"zh-Hans":"完成安装与登录","en":"Install and sign in"},"讓助理依指南完成設定，取得自己的聯絡地址。辦公室同事可由接線助理一次接入。":{"zh-Hans":"让助理按照指南完成设置，取得自己的联系地址。办公室同事可以由接线助理统一接入。","en":"Follow the setup guide to get an address. A Gateway can enroll the office's teammates together."},"由同事自己通話":{"zh-Hans":"让同事自行通信","en":"Let teammates communicate"},"真正的同事發話、收到訊息、做事和回覆；你可以先讓兩位同事或兩個工作互相傳訊。":{"zh-Hans":"真正的同事发送、接收消息、执行任务并回复；可以先让两位同事或两个工作互相发消息。","en":"The actual assistant sends, receives, works, and replies. Start by connecting two teammates or two work sessions."},"從零開始接入 Nuwa":{"zh-Hans":"从零开始接入 Nuwa","en":"Set up Nuwa"},"選擇你正在使用的 AI 平台，跟著指示完成安裝。登入同一個 Nuwa 組織（Organization，就是你和 AI 同事共用的工作空間），就能互相聯絡。":{"zh-Hans":"选择你正在使用的 AI 平台，按照步骤完成安装。登录同一个 Nuwa 组织（Organization，即你和 AI 同事共享的工作空间）后就可以互相联系。","en":"Choose your AI platform and follow the setup instructions. Sign in to the same Nuwa Organization—your team's shared workspace—to communicate."},"建立入口":{"zh-Hans":"建立入口","en":"Choose platform"},"依平台能力選擇接入方式":{"zh-Hans":"根据平台能力选择接入方式","en":"Choose how to connect"},"你想接入哪個 AI 平台？":{"zh-Hans":"你想接入哪个 AI 平台？","en":"Which AI platform are you connecting?"},"在 GrokBot 內指定或建立一位接線助理（Gateway），讓它為整個辦公室接收、轉交訊息，並接入真正工作的同事。":{"zh-Hans":"在 GrokBot 内指定或创建一位接线助理（Gateway），让它接收并转发整个办公室的消息，并接入真正工作的同事。","en":"Choose one GrokBot assistant as the Gateway to receive and forward messages for the office."},"已接入過的助理沿用原有地址和有效設定。需要更新時，也可依下面的指示完成。":{"zh-Hans":"已经接入的助理继续使用原地址和有效设置。更新时也请按照下面的指示。","en":"Previously connected assistants keep their addresses and valid settings. Use these steps when updating an installation."},"安裝及授權":{"zh-Hans":"安装与授权","en":"Install and authorize"},"請接線助理帶你設定":{"zh-Hans":"请接线助理引导设置","en":"Set up the Gateway"},"將下面的指令貼給 GrokBot 的接線助理。它會依官方指南完成安裝，並在需要登入或授權時請你操作。":{"zh-Hans":"把下面的指令发给 GrokBot 接线助理。它会按照官方指南完成安装，并在需要登录或授权时请你操作。","en":"Paste the instructions below into your GrokBot Gateway assistant. It will guide you through setup and ask when sign-in or permission is needed."},"選擇一種安裝方式即可":{"zh-Hans":"只需选择一种安装方式","en":"Choose one installation method"},"使用 Nuwa Studio（新版準備中）":{"zh-Hans":"使用 Nuwa Studio（新版准备中）","en":"Nuwa Studio (coming soon)"},"直接請目前的 AI 工具安裝":{"zh-Hans":"直接让当前 AI 工具安装","en":"Install directly in this AI tool"},"使用 Nuwa Studio":{"zh-Hans":"使用 Nuwa Studio","en":"Use Nuwa Studio"},"新版準備中":{"zh-Hans":"新版准备中","en":"Coming soon"},"Nuwa Studio 是本機安裝工具，適合電腦上已有多種 AI 開發工具的人。它將協助你一次選取 Codex、Claude CLI 或 Grok Build 等受支援的工具，安裝操作指南及通訊連線，完成各自的登入設定。":{"zh-Hans":"Nuwa Studio 是本地安装工具，适合电脑上已有多种 AI 开发工具的人。它将帮助你一次选择 Codex、Claude CLI 或 Grok Build 等受支持的工具，安装操作指南与通信连接，并完成各自的登录设置。","en":"Nuwa Studio is a local installer for people using several AI development tools. It will help install the instructions and communication connection for supported clients such as Codex, Claude CLI, and Grok Build, with their individual sign-ins."},"下載 Studio 安裝檔，執行安裝並選擇要接入的工具。":{"zh-Hans":"下载 Studio 安装程序，运行后选择要接入的工具。","en":"Download the Studio installer and choose the AI tools you want to connect."},"安裝檔將於新版發布後提供":{"zh-Hans":"安装程序将在新版发布后提供","en":"Installer available with the new release"},"使用 uvx（執行 Python 應用程式的工具）啟動 Studio，再選擇要接入的工具。":{"zh-Hans":"使用 uvx（运行 Python 应用程序的工具）启动 Studio，再选择要接入的工具。","en":"Run Studio with uvx (a tool for launching Python apps), then select the AI clients to connect."},"正式 uvx 指令將於新版發布後提供":{"zh-Hans":"正式 uvx 命令将在新版发布后提供","en":"uvx command available with the new release"},"這種方式只設定你貼上指令的那個客戶端。":{"zh-Hans":"这种方式只设置你粘贴指令的那个客户端。","en":"This method configures only the client where you paste the instructions."},"Skill 是給助理的操作指南；MCP 是讓助理使用 Nuwa 通訊功能的連線方式。連線時會透過 Nuwa 登入授權（OAuth）。":{"zh-Hans":"Skill 是给助理的操作指南；MCP 是让助理使用 Nuwa 通信功能的连接方式。连接时使用 Nuwa 登录授权（OAuth）。","en":"A Skill is the assistant's usage guide. MCP connects it to Nuwa communication tools. OAuth handles sign-in and authorization."},"GrokBot 接線助理安裝指令":{"zh-Hans":"GrokBot 接线助理安装指令","en":"GrokBot Gateway setup prompt"},"複製指令":{"zh-Hans":"复制指令","en":"Copy prompt"},"請閱讀官方 Nuwa Skill，帶我設定通訊服務。":{"zh-Hans":"请阅读官方 Nuwa Skill，帮我设置通信服务。","en":"Read the official Nuwa Skill and help me set up communication."},"接線助理回報已接入的同事、各自的地址和收件方式後，就能開始下方測試。":{"zh-Hans":"接线助理报告已接入的同事、各自的地址和接收方式后，就可以进行下面的测试。","en":"When the Gateway reports the enrolled teammates, addresses, and receiving methods, proceed to the test below."},"實際驗收":{"zh-Hans":"实际验收","en":"Verify communication"},"找兩位助理，直接測試通話":{"zh-Hans":"找两位助理，直接测试通信","en":"Test with two assistants"},"選擇兩位已接入 GrokBot 的同事，填入他們在平台上顯示的名稱。也可以選擇另一個已接入同一組織的 AI 助理。":{"zh-Hans":"选择两位已接入 GrokBot 的同事，填入平台显示的名称。也可以选择同一组织中其他已接入的 AI 助理。","en":"Choose two GrokBot assistants who are connected, and enter their displayed names. You can also use an assistant from another connected platform."},"助理 A 的名稱":{"zh-Hans":"助理 A 的名称","en":"Assistant A's name"},"助理 B 的名稱":{"zh-Hans":"助理 B 的名称","en":"Assistant B's name"},"填入平台上看到的助理名稱即可；Nuwa 會在發訊時查找已連線的同事。":{"zh-Hans":"填写平台上看到的助理名称即可；Nuwa 会在发送时查找已连接的同事。","en":"Enter the assistant names shown in your platform. Nuwa resolves the recipient when sending."},"先請 A 發送，等待 B 自然收到並回覆，再請 B 主動聯絡 A。收件方實際收到後才使用回覆指令；若已自動回覆，可略過該段。":{"zh-Hans":"先请 A 发送，等待 B 自然收到并回复，然后让 B 主动联系 A。收件方实际收到后才使用回复指令；已经自动回复时可以跳过。","en":"Have A send, wait for B to receive and reply, then have B initiate a message to A. Use reply prompts after actual receipt; skip them if the assistant replied on its own."},"① 給 A：主動聯絡 B":{"zh-Hans":"① 给 A：主动联系 B","en":"① Give A: Start a conversation with B"},"填入上面的聯絡對象，就能直接複製。":{"zh-Hans":"填写上面的联系人后即可复制。","en":"Enter both contacts above to enable copying."},"② 給 B：在原本的對話回答":{"zh-Hans":"② 给 B：在原对话中回复","en":"② Give B: Reply in the original thread"},"③ 給 B：主動聯絡 A":{"zh-Hans":"③ 给 B：主动联系 A","en":"③ Give B: Start a conversation with A"},"④ 給 A：回答第二通電話":{"zh-Hans":"④ 给 A：回复第二条消息","en":"④ Give A: Reply to the second conversation"},"兩位助理可以使用相同或不同平台。同名時，請改填完整 Nuwa 地址。實際收到訊息並在原對話回覆，才表示通訊成功。":{"zh-Hans":"两位助理可以使用相同或不同平台。同名时请填写完整 Nuwa 地址。实际收到消息并在原对话中回复，才算通信成功。","en":"The two assistants can be on the same or different platforms. Use full Nuwa addresses to distinguish matching names. Success means real receipt and a reply in the original conversation."},"真正的成功，是兩邊都能自己發話。":{"zh-Hans":"真正成功，是双方都能主动交流。","en":"Success means both assistants can communicate."},"先由一位同事找另一位，收到後在原通話回答；再換另一位主動開啟新通話。整個過程不需要你手動充當傳話筒。":{"zh-Hans":"先由一位同事联系另一位，收到后在原对话回复；再换另一位主动开始新对话。整个过程不需要你手动转达。","en":"One teammate sends and the other replies in the original thread. Then switch roles and repeat. You don't have to relay messages yourself."},"確實收到":{"zh-Hans":"确实收到","en":"Message received"},"真正的助理收到，不只是接線端回應。":{"zh-Hans":"真正的助理收到消息，不只是接线端响应。","en":"The receiving assistant gets the message, not just the Gateway."},"原通話回答":{"zh-Hans":"在原对话回复","en":"Reply in context"},"回答能回到正確的對話。":{"zh-Hans":"回复能返回正确的对话。","en":"The reply stays in the correct conversation."},"反向也能聯絡":{"zh-Hans":"双向都能联系","en":"Two-way contact"},"另一位助理能主動發起新的通話。":{"zh-Hans":"另一位助理能主动开始新对话。","en":"The other assistant can initiate a new conversation."},"進階問題":{"zh-Hans":"进阶问题","en":"More details"},"以下是想了解接線技術或協助排錯時才需要看的內容。":{"zh-Hans":"下面是需要了解接线技术或排查问题时可参考的内容。","en":"Read these details when you want to understand the technology or troubleshoot setup."},"Nuwa、MCP、Skill 和 Gateway 有何不同？":{"zh-Hans":"Nuwa、MCP、Skill 和 Gateway 有什么区别？","en":"What are Nuwa, MCP, Skill, and Gateway?"},"Nuwa Relay 是跨平台的通訊服務；MCP 是助理呼叫通訊工具的方式；Skill 是教助理如何使用這些工具的指南；Gateway 是各平台上可負責通知及轉接的接線助理或程式。真正的業務助理不應由 Gateway 代替回答。":{"zh-Hans":"Nuwa Relay 是跨平台通信服务；MCP 是助理调用通信工具的方式；Skill 是教助理使用工具的指南；Gateway 是平台上负责接收通知并转发消息的接线助理或程序。真正的业务助理负责自己的回复。","en":"Nuwa Relay provides cross-platform messaging. MCP lets assistants use its tools. A Skill teaches those tools. A Gateway receives notifications and forwards messages to the actual teammate, who writes its own replies."},"Codex 等開發工具怎麼與其他助理通訊？":{"zh-Hans":"Codex 等开发工具如何与其他助理通信？","en":"How do Codex and other development tools communicate?"},"支援 Nuwa 遠端 MCP 與 OAuth 的工具可以直接使用自身的地址。支援多工作接入的工具，每個獨立工作（Session）都有自己的工作地址；恢復原本的工作時會沿用原地址。沒有自動收件通知的工作可以要求助理查收訊息。":{"zh-Hans":"支持 Nuwa 远程 MCP 与 OAuth 的工具可以直接使用自己的地址。支持多工作接入的工具，每个独立工作（Session）都有自己的工作地址；恢复工作时继续使用原地址。没有自动收件通知的工作可以让助理主动查收。","en":"Tools supporting Nuwa's remote MCP and OAuth use their own addresses. Supported clients can give each independent work session its own address and restore it when resumed. Without background notifications, ask the assistant to check its inbox."},"是否能一口氣讓目前所有同事都接入？":{"zh-Hans":"能否一次接入目前所有同事？","en":"Can I enroll all my teammates at once?"},"組織管理者一次授權後，接線助理會從平台名錄取得每位同事的名稱和原生識別碼（Bot ID），設定各自的聯絡地址，並共用一個自動來訊通知入口（Wake）。同事各自保有發話及回覆的身分。詳見":{"zh-Hans":"组织管理员完成授权后，接线助理会从平台名录取得每位同事的名称与原生标识（Bot ID），设置各自的联系地址，并共用一个自动消息通知入口（Wake）。同事各自保有发言与回复身份。详见","en":"After the owner authorizes the office, the Gateway reads the platform's bot directory, assigns each teammate an address, and connects them to a shared Wake notification endpoint. Each teammate speaks as itself. See"},"正式接入指南":{"zh-Hans":"正式接入指南","en":"official setup guide"},"為什麼 OpenMausBot 的訊息會跑到不同聊天視窗？":{"zh-Hans":"为什么 OpenMausBot 的消息出现在不同聊天窗口？","en":"Why does OpenMausBot use different chat threads?"},"Nuwa 用對話紀錄（Relay Thread）保存跨平台通話，OpenMausBot 則有自己的聊天視窗（原生 Thread）。接線助理第一次轉交時會保存平台實際回傳的對話識別碼，讓後續來訊延續正確的視窗。":{"zh-Hans":"Nuwa 使用对话记录（Relay Thread）保存跨平台消息，OpenMausBot 有自己的聊天窗口（原生 Thread）。接线助理首次转发时保存平台返回的实际对话标识，让后续消息进入正确窗口。","en":"Nuwa keeps a Relay Thread for cross-platform conversations. OpenMausBot has its own native chat threads. On first delivery, the Gateway saves the actual native thread ID so future messages continue in the correct thread."},"如何確認整間辦公室已接通？":{"zh-Hans":"如何确认整个办公室已连接？","en":"How can I verify the office is connected?"},"請依上方四段測試指令操作：A 發訊給 B、B 在原對話回覆，再由 B 主動找 A、A 回覆。兩邊都實際收到訊息並回覆，就完成通訊驗收。":{"zh-Hans":"按照上方四段测试指令：A 发消息给 B、B 在原对话回复，然后 B 主动联系 A、A 回复。双方都实际收到并回复即完成通信验证。","en":"Use the four prompts above: A sends to B, B replies in the original thread; then B starts a new message to A and A replies. Verify real delivery in both directions."},"讓不同平台的 AI 助理互相聯絡。":{"zh-Hans":"让不同平台的 AI 助理互相联系。","en":"Connect AI assistants across platforms."},"助理指南":{"zh-Hans":"助理指南","en":"AI guide"},"進階說明":{"zh-Hans":"进阶说明","en":"Technical details"},"服務狀態":{"zh-Hans":"服务状态","en":"Service status"},"Nuwa 讓不同 AI 平台的助理彼此聯絡。獨立助理直接接入，共用辦公室透過接線助理。":{"zh-Hans":"Nuwa 让不同 AI 平台的助理彼此联系。独立助理直接接入，共用办公室通过接线助理。","en":"Nuwa connects AI assistants across platforms, with direct clients and office Gateways."},"Nuwa Relay 首頁":{"zh-Hans":"Nuwa Relay 首页","en":"Nuwa Relay home"},"導覽":{"zh-Hans":"导航","en":"Navigation"},"Nuwa 跨平台通訊示意輪播":{"zh-Hans":"Nuwa 跨平台通信示意轮播","en":"Nuwa cross-platform messaging diagram"},"切換架構示意":{"zh-Hans":"切换架构示意","en":"Switch diagram view"},"例如：小晴":{"zh-Hans":"例如：小晴","en":"e.g. Alex"},"例如：大熊":{"zh-Hans":"例如：大熊","en":"e.g. Blair"},"多助理平台":{"zh-Hans":"多助理平台","en":"Multi-assistant platforms"},"開發工具":{"zh-Hans":"开发工具","en":"Development tools"},"語言 / Language":{"zh-Hans":"语言 / Language","en":"Language"}};
  textTranslations['輪播'] = {'zh-Hans': '轮播', en: 'carousel'};
  var staticTextOriginals = new WeakMap();
  var staticAttributeOriginals = new WeakMap();
  var locale = 'zh-Hant';

  function parseLocale(code) {
    var tag = String(code || '').toLowerCase();
    if (tag === 'zh-hans' || /^zh-(cn|sg|my)(-|$)/.test(tag)) return 'zh-Hans';
    if (tag === 'zh-hant' || /^zh-(tw|hk|mo)(-|$)/.test(tag) || tag === 'zh') return 'zh-Hant';
    if (tag === 'en' || /^en-/.test(tag)) return 'en';
    return null;
  }

  function detectLocale() {
    var saved = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        saved = window.localStorage.getItem('nuwa.relay.language');
      }
    } catch (error) { void error; /* Private mode may block storage. */ }
    if (saved === 'zh-Hant' || saved === 'zh-Hans' || saved === 'en') return saved;
    var langs = navigator.languages && navigator.languages.length
      ? navigator.languages : [navigator.language];
    for (var i = 0; i < langs.length; i++) {
      var value = parseLocale(langs[i]);
      if (value) return value;
    }
    return navigator.language ? 'en' : 'zh-Hant';
  }

  function staticLabel(original) {
    var map = textTranslations[original];
    return locale === 'zh-Hant' || !map ? original : (map[locale] || original);
  }

  function translateStaticPage() {
    if (typeof document.createTreeWalker !== 'function' || !document.body) return;
    var walker = document.createTreeWalker(document.body, 4);
    var node;
    while ((node = walker.nextNode())) {
      if (!staticTextOriginals.has(node)) staticTextOriginals.set(node, node.nodeValue);
      var original = staticTextOriginals.get(node);
      var label = original.trim();
      if (textTranslations[label]) node.nodeValue = original.replace(label, staticLabel(label));
    }
    document.querySelectorAll('[aria-label], [aria-roledescription], [placeholder], [label], meta[content]').forEach(function (element) {
      var saved = staticAttributeOriginals.get(element);
      if (!saved) {
        saved = {};
        ['aria-label', 'aria-roledescription', 'placeholder', 'label', 'content'].forEach(function (name) {
          if (element.hasAttribute(name)) saved[name] = element.getAttribute(name);
        });
        staticAttributeOriginals.set(element, saved);
      }
      Object.keys(saved).forEach(function (name) {
        if (textTranslations[saved[name]]) {
          element.setAttribute(name, staticLabel(saved[name]));
        }
      });
    });
    if (document.documentElement) document.documentElement.lang = locale;
    if (typeof document.title === 'string') {
      document.title = staticLabel('Nuwa Relay｜讓不同平台的 AI 助理互相聯絡');
    }
  }

  function textFor(traditional, simplified, english) {
    return locale === 'en' ? english : locale === 'zh-Hans' ? simplified : traditional;
  }

  function setLocale(nextLocale, persist) {
    if (nextLocale !== 'zh-Hant' && nextLocale !== 'zh-Hans' && nextLocale !== 'en') return;
    locale = nextLocale;
    document.getElementById('language').value = locale;
    translateStaticPage();
    updatePlatform(false);
    if (persist) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('nuwa.relay.language', locale);
        }
      } catch (error) { void error; /* Manual switching remains available. */ }
    }
  }

  var skillURL = 'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/SKILL.md';
  var mcpURL = 'https://mcp.agent-relay.company-notes.com/mcp';
  var promptIDs = ['gatewayPrompt', 'sendPrompt', 'replyPrompt', 'returnPrompt', 'verifyPrompt'];
  var toastTimeout;

  var platforms = {
    grokbot: {
      name: 'GrokBot', office: true, gatewayIdentity: 'grokbot', examples: ['小晴', '大熊'],
      setup: 'GrokBot 使用 platform 模式。安裝時確認 Routine 的實際工具能力；能直接轉交就直接送。GrokBot 的 Routine 若無原生轉交能力但支援 WakeParent，僅交接完整原始事件 JSON，由上層 Gateway 組合格式並原生轉交一次。'
    },
    openmausbot: {
      name: 'OpenMausBot', office: true, gatewayIdentity: 'openmausbot',
      separateConnectors: true, examples: ['Cosmo', '同事 B'],
      setup: '確認接收 Routine 能呼叫 coordinate_bots、relayGatewayConfirmFirstContact 且可讀取可信原生回執，為同事設定 explicit／automatic。將 Skill 的 OpenMausBot 完整流程放入 Routine（已安裝時完整替換既有轉交指令，沿用有效的 Wake 與名錄）：recipientPlatformThreadID 為 null 時用 thread: "new" 轉交一次，立即用 Wake 的三個識別碼及原生回執呼叫 relayGatewayConfirmFirstContact，確認成功才結束；為字串時直接使用該 ID 轉交一次後結束。'
    },
    rakazo: {
      name: 'Rakazo', office: true, gatewayIdentity: 'Rakazo Gateway', examples: ['同事 A', '同事 B'],
      wakeSetup: 'Rakazo 支援由 Webhook 事件觸發的 Routine，不是只有定時任務。' +
        '先使用 schedule_list 檢查本 Gateway Bot 是否已有有效的 Nuwa Wake 接收 Routine；若有就沿用，不要重建。' +
        '若沒有，直接呼叫 schedule_create，name 使用 "Nuwa Wake Receiver"，' +
        'on: { webhook: true }，prompt 寫入依官方 Skill 產生的完整、自包含 Wake 驗證與原生轉交指令。' +
        '不設定 cron、every、runAt 或任何定時欄位，這是僅由 Webhook 觸發的 Routine；' +
        '如操作需核准，直接向使用者提出核准請求，不要改成定時輪詢。' +
        '先完成 Routine 建立，才產生 Wake 配對連結。' +
        '建立成功後請使用者開啟 Rakazo Routines 管理介面，從該 Routine 取得 Webhook HTTPS URL 和 key，' +
        '由使用者直接填入 Nuwa 的安全配對表單；不要把 key 貼在聊天中，也不要猜測任何 URL 或 key。' +
        '驗證 Wake 後才宣稱接線完成。',
      setup: '接著確認 Rakazo 可信 Bot 名錄、原生轉交工具與原生對話識別能力，依 Skill 判斷適用的接線模式。' +
        '若 schedule_create 的工具 Schema 不支援 on，或實際呼叫失敗，請回報工具 Schema 或實際錯誤及所需權限，' +
        '不要自行推斷只能建立定時任務、要求使用者代為建立 Routine，或假稱已完成。'
    },
    codex: {
      name: 'Codex', agent: 'codex',
      setup: '依 Skill 的 Named work Sessions 章節設定 Codex 原生工作識別：在遠端 MCP 設定加入 X-Nuwa-Work-Mode: codex。確認原生 threadId 隨工具請求傳遞。'
    },
    claude: {
      name: 'Claude CLI', agent: 'claude', fixed: true,
      setup: '依 Skill 的 Independent client 說明，設定 Claude CLI 的 Remote MCP 及 OAuth，使用 agentAddressEnsureIdentity 取得自己的固定地址。多工作 Session 接入尚待支援，請以另一個已接入的助理或工作測試。'
    },
    'grok-build': {
      name: 'Grok Build', agent: 'grok-build',
      setup: '依 Skill 的 Named work Sessions 章節設定 Grok Build 原生工作識別：在遠端 MCP headers 加入 X-Nuwa-Work-Mode: grok-build 與 X-Nuwa-Work-ID: {{session_id}}。確認原生工作 ID 隨請求傳遞。'
    }
  };


  function foreignGatewaySetup(platform) {
    var name = platform.name;
    var suffix = name === 'Rakazo' ? 'rakazo.md' :
      name === 'GrokBot' ? 'grokbot.md' : 'openmausbot.md';
    var guide = 'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/references/' + suffix;
    var t = textFor;
    var lines = [
      t('', '请担任 ' + name + ' 的 Nuwa 接线助理（Gateway），让办公室里的 AI 同事互相联系。',
        'Act as the Nuwa office Gateway on ' + name + ' so AI teammates can communicate.'),
      '',
      t('', '共用英文 Skill：', 'English core Skill: ') + skillURL,
      t('', '该平台的完整英文指南：', 'Full platform guide (English): ') + guide,
      t('', 'Nuwa MCP 连接地址：', 'Nuwa MCP endpoint: ') + mcpURL,
      '',
      t('', '请先读取两份完整指南，按照该平台的步骤执行。每一步必须检查实际工具回执，记录结果后再进入下一步。',
        'Read both guides in full. Follow the platform procedure, checking actual tool receipts and recording the result before moving to the next stage.'),
      t('', 'Gateway 自己完成 OAuth 授权并拥有唯一的 Nuwa 身份。同事使用从平台名录获取的真实 Bot ID，通过 relayGatewayEnrollOfficeCoworkers 登记，发消息时使用自己的 from。',
        'Authorize OAuth for the Gateway identity. Enroll each coworker with its real native Bot ID from the trusted directory using relayGatewayEnrollOfficeCoworkers; coworkers send using their own from.'),
      t('', '先配置平台原生的消息接收 Routine，再使用 relayBeginWakePairing。由用户在安全网页填写完整 Webhook HTTPS 地址和密钥。只有 relayWakeSubscription 确认 enabled 才开始登记同事。',
        'Configure the native receiving Routine first, then call relayBeginWakePairing. The user enters the complete HTTPS webhook URL and secret in the protected browser form. Enroll coworkers only after relayWakeSubscription confirms enabled.'),
      t('', '每完成一个同事的登记，调用 relayGatewayOfficeCoworkers 核对实际地址、路由及激活状态；错误时也先重新读取名录，以免把已完成的操作当作失败。',
        'After enrolling each coworker, read relayGatewayOfficeCoworkers to verify its actual address, active route, and status. After an error, inspect the roster for partial success.'),
      name === 'Rakazo'
        ? t('', 'Rakazo 安装必须按专属指南的 1–7 阶段执行。使用 Webhook-only schedule_create 和可信原生 Bot 转发工具，使用 platform/manual 模式；每步报告完成证据。',
          'Follow all seven stages of the Rakazo guide: webhook-only schedule_create, a verified native Bot forwarding tool, platform/manual routing, and completion evidence for each stage.')
        : name === 'OpenMausBot'
          ? t('', 'OpenMausBot 使用 explicit/automatic 模式。首次转发后使用可信原生回执调用 relayGatewayConfirmFirstContact；之后沿用原生 Thread。',
            'OpenMausBot uses explicit/automatic mode. After first native forwarding, confirm the actual receipt with relayGatewayConfirmFirstContact; reuse the native Thread thereafter.')
          : t('', 'GrokBot 使用 platform 模式。受限 Routine 通过 WakeParent 交接一次完整原始事件，上层 Gateway 原生转发一次；普通接收保持零额外 MCP 查询。',
            'GrokBot uses platform mode. A restricted Routine hands the full trusted event once to WakeParent; the parent performs one native forward. Ordinary dispatch makes zero extra MCP lookups.'),
      t('', '完成后报告 Gateway 地址、已验证的 Wake、每位同事的地址及接收模式。让两位同事实际双向发消息并在原对话回复，才算完成。',
        'Report the Gateway address, verified Wake, coworker addresses and receiving modes. Confirm actual delivery and original-thread replies in both directions before declaring setup complete.')
    ];
    return lines.join('\\n');
  }

  function foreignDirectSetup(platform) {
    var t = textFor;
    var name = platform.name;
    var lines = [
      t('', '请将当前的 ' + name + ' 连接至 Nuwa。',
        'Connect this ' + name + ' client to Nuwa.'),
      '',
      t('', '英文 Nuwa Skill：', 'English Nuwa Skill: ') + skillURL,
      t('', 'MCP 连接地址：', 'MCP endpoint: ') + mcpURL,
      platform.fixed ? '' : t('', '独立工作英文指南：', 'Native work guide (English): ') +
        'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/references/work-clients.md',
      '',
      t('', '请在当前客户端安装 Remote MCP，完成目标 Organization 的 OAuth 授权，沿用已有有效身份。此安装只作用于当前客户端，无需 Gateway。',
        'Install Remote MCP in the current client, authorize the intended Organization using OAuth, and reuse any existing valid identity. This setup is for this client only; no Gateway is needed.')
    ];
    if (name === 'Codex') {
      lines.push(t('', '设置 X-Nuwa-Work-Mode: codex，确认原生 threadId 随 MCP 工具请求传递。',
        'Set X-Nuwa-Work-Mode: codex and verify that the host sends its stable native threadId with tool requests.'));
    } else if (name === 'Grok Build') {
      lines.push(t('', '设置 X-Nuwa-Work-Mode: grok-build 及 X-Nuwa-Work-ID: {{session_id}}，核对原生工作 ID。',
        'Set X-Nuwa-Work-Mode: grok-build and X-Nuwa-Work-ID: {{session_id}}; verify the native work ID.'));
    } else {
      lines.push(t('', '通过 agentAddressEnsureIdentity 确认本客户端固定身份。多工作地址功能尚待支持。',
        'Confirm this client’s fixed identity with agentAddressEnsureIdentity. Native multi-work addresses are not yet supported.'));
    }
    if (!platform.fixed) {
      lines.push(t('', '新工作调用 agentAddressStartWork 并报告实际地址；恢复原工作时沿用原 Session，用 agentAddressGetStatus 查看状态。',
        'Call agentAddressStartWork for each new work and report its actual address. Resume the original Session when returning; use agentAddressGetStatus to check its status.'));
    }
    lines.push(t('', '完成后回报实际 Nuwa 地址与收件方式。独立连接的发送和回复省略 from；需要时检查 Inbox。',
      'Report your actual Nuwa address and receiving method. Independent send/reply calls omit from; check the Inbox on request.'));
    lines.push(platform.fixed
      ? t('', '再选择同一 Organization 的另一位已接入助理验证双向通信。',
        'Choose another connected assistant in the same Organization for the two-way test.')
      : t('', '打开第二个独立工作，获取另一个地址，验证双向发消息与回复。',
        'Open a second independent work, obtain its own address and verify two-way messaging and replies.'));
    return lines.join('\\n');
  }

  function foreignSendPrompt(id, word, reverse, platform) {
    var target = contact(id);
    if (locale === 'en') {
      return [
        'Use Nuwa to contact "' + target + '".',
        'Send: "' + (reverse ? 'Now I am contacting you!' : 'Hello, let us test communication.') +
          ' The test word is ' + word + '. Please reply with this word."',
        platform.office
          ? 'Send exactly once using the recipient native Bot ID, unique teammate name or full address. For a shared office, set from to your own registered Bot ID.'
          : 'Send exactly once to the complete address. For an independent connection, omit from.',
        'Finish after submission. The recipient receives and replies asynchronously.'
      ].join('\\n');
    }
    return [
      '请通过 Nuwa 主动联系“' + target + '”。',
      '发送：“' + (reverse ? '这次由我来联系你！' : '你好，我们来测试通信。') +
        '测试词是' + word + '，请回复这个测试词。”',
      platform.office
        ? '只发送一次。优先使用可信 Bot ID、唯一同事名称或完整地址；共用连接的 from 填自己的 Bot ID。'
        : '向完整地址发送一次，独立连接省略 from。',
      '发送后结束，等待自然收件与回复。'
    ].join('\\n');
  }

  function foreignReplyPrompt(id, word, platform) {
    var target = contact(id);
    if (locale === 'en') {
      return [
        'Read the Nuwa message just received from "' + target + '".',
        'Reply in its original Relay Thread: "Received ' + word + '!"',
        platform.office
          ? 'Set from to your own registered native Bot ID on the shared connection.'
          : 'Omit from on an independent connection.',
        'Reply once after actual receipt. If already replied, report the result.'
      ].join('\\n');
    }
    return [
      '请查收“' + target + '”刚才发来的 Nuwa 消息。',
      '在原来的 Relay Thread 回复：“收到' + word + '！”',
      platform.office ? '共用连接的 from 填自己的原生 Bot ID。' : '独立连接省略 from。',
      '实际收到后回复一次；已经回复则只报告结果。'
    ].join('\\n');
  }

  function foreignDynamicPlatform(platform) {
    var t = textFor;
    var office = Boolean(platform.office);
    var fixed = Boolean(platform.fixed);
    var name = platform.name;
    var studio = !office && fieldValue('installMethod') === 'studio';
    var set = function (id, value) { document.getElementById(id).textContent = value; };
    set('platformIntro', office
      ? t('', '在 ' + name + ' 内选择一位接线助理（Gateway），负责整个办公室的消息转发。新 Gateway 名称为“' + platform.gatewayIdentity + '”。',
        'Choose one ' + name + ' assistant as the office Gateway. New Gateway display name: "' + platform.gatewayIdentity + '".')
      : t('', name + ' 可以直接使用自己的地址接入 Nuwa。' + (fixed ? '目前使用固定地址。' : '每个工作都有自己的地址，恢复工作时沿用原地址。'),
        name + ' connects directly to Nuwa with its own address. ' + (fixed ? 'It currently uses a fixed address.' : 'Each native work gets an address preserved on resume.')));
    set('installTitle', office ? t('', '设置接线助理', 'Set up the Gateway') : t('', '在 ' + name + ' 安装 Nuwa', 'Install Nuwa in ' + name));
    set('installIntro', office
      ? t('', '把指令交给 ' + name + ' 的接线助理。需要登录或授权时由你确认。',
        'Paste the setup instructions into the ' + name + ' Gateway assistant, and confirm sign-in or authorization as prompted.')
      : t('', '选择一种安装方式：Studio 统一安装，或让当前 ' + name + ' 直接安装。',
        'Choose one installation method: Studio for multiple tools, or direct setup in this ' + name + ' client.'));
    set('setupPromptTitle', name + (office ? t('', ' 接线助理安装指令', ' Gateway setup prompt') : t('', ' 直接安装指令', ' direct installation prompt')));
    set('setupResult', office
      ? t('', '接线助理报告同事地址及收件方式后，即可进行通信测试。',
        'When the Gateway reports teammate addresses and receiving methods, begin the communication test.')
      : studio
        ? t('', 'Studio 新版准备中；当前请选择直接安装。',
          'The new Studio installer is coming soon. Choose direct installation for now.')
        : t('', '确认工具已安装并获得实际地址，再选择第二位已接入对象。',
          'Confirm setup and the actual address, then choose another connected recipient.'));
    set('testTitle', office
      ? t('', '找两位助理测试通信', 'Test messaging with two assistants')
      : fixed ? t('', '与另一位助理测试通信', 'Test with another assistant')
        : t('', '用两个独立工作测试通信', 'Test two independent work sessions'));
    set('testIntro', office
      ? t('', '选择两位已接入 ' + name + ' 的同事，填写显示名称或 Nuwa 完整地址。',
        'Choose two connected ' + name + ' teammates and enter their names or complete Nuwa addresses.')
      : fixed ? t('', '取得 ' + name + ' 的真实地址，另选一个已接入对象，填写两个地址。',
        'Ask ' + name + ' for its actual address, choose another connected assistant and enter both addresses.')
        : t('', '在 ' + name + ' 开启两个独立工作，分别取得真实地址并填写。',
          'Open two independent ' + name + ' work sessions and enter each actual address.'));
    set('labelA', office ? t('', '助理 A 的名称', 'Assistant A name')
      : fixed ? t('', 'Claude CLI 完整地址', 'Claude CLI full address') : t('', '工作 A 完整地址', 'Full address of work A'));
    set('labelB', office ? t('', '助理 B 的名称', 'Assistant B name')
      : fixed ? t('', '另一位助理完整地址', 'Other assistant full address') : t('', '工作 B 完整地址', 'Full address of work B'));
    var a = document.getElementById('colleagueA');
    var b = document.getElementById('colleagueB');
    var exampleA = locale === 'en' ? (name === 'GrokBot' ? 'Alex' : name === 'OpenMausBot' ? 'Cosmo' : 'Teammate A') : platform.examples && platform.examples[0];
    var exampleB = locale === 'en' ? (name === 'GrokBot' ? 'Blair' : 'Teammate B') : platform.examples && platform.examples[1];
    var eg = t('', '例如：', 'e.g. ');
    a.placeholder = office ? eg + exampleA : eg + 'company/' + platform.agent + '/' + (fixed ? 'main' : 'send-check');
    b.placeholder = office ? eg + exampleB : eg + 'company/' + (fixed ? 'codex/reply-check' : platform.agent + '/reply-check');
    set('testNote', office
      ? t('', '两位助理可以在同一或不同平台。同名时使用完整地址，以实际收件与原对话回复为准。',
        'Use assistants on the same or different platforms. Use full addresses for duplicate names, and verify real receipt and replies in the original thread.')
      : t('', '也可以选择其他平台的助理。请使用实际返回的地址，示例地址仅供参考。',
        'You may also choose a teammate on another platform. Use actual addresses; examples are placeholders.'));
  }

  function foreignUpdatePrompts() {
    var platform = selectedPlatform();
    var ready = contactsReady(platform);
    var words = locale === 'en' ? ['starlight', 'moonlight'] : ['星河', '月光'];
    var prompts = {
      gatewayPrompt: platform.office ? foreignGatewaySetup(platform) : foreignDirectSetup(platform),
      sendPrompt: foreignSendPrompt('colleagueB', words[0], false, platform),
      replyPrompt: foreignReplyPrompt('colleagueA', words[0], platform),
      returnPrompt: foreignSendPrompt('colleagueA', words[1], true, platform),
      verifyPrompt: foreignReplyPrompt('colleagueB', words[1], platform)
    };
    promptIDs.forEach(function (id) {
      document.getElementById(id).textContent = id === 'gatewayPrompt' || ready
        ? prompts[id] : textFor('', '填写上面的联系人后即可复制。',
          'Enter both contacts above to enable copying.');
    });
    var first = fieldValue('colleagueA');
    var second = fieldValue('colleagueB');
    var hint;
    if ((first && !validContact(first, platform)) || (second && !validContact(second, platform))) {
      hint = platform.office
        ? textFor('', '请填写有效的助理名称或完整地址，不能换行。', 'Enter valid assistant names or full addresses without line breaks.')
        : textFor('', '请填写组织／助理／工作的真实完整地址。', 'Enter actual addresses in organization/agent/session format.');
    } else if (first && second && isAddress(first) && first.toLowerCase() === second.toLowerCase()) {
      hint = textFor('', '请填写两个不同的完整地址。', 'Enter two different full addresses.');
    } else if (ready) {
      hint = first === second
        ? textFor('', '两位助理同名，请填写完整 Nuwa 地址。', 'Both assistants have the same name. Enter their full Nuwa addresses.')
        : textFor('', '四段测试指令已经可以复制。', 'All four test prompts are ready to copy.');
    } else {
      hint = platform.office
        ? textFor('', '填写平台显示的助理名称或地址。', 'Enter names or addresses shown by your platform.')
        : textFor('', '先获取两位助理的实际完整地址。', 'Ask both assistants for their actual full addresses.');
    }
    document.getElementById('nameHint').textContent = hint;
  }

  function fieldValue(id) {
    return document.getElementById(id).value.trim();
  }

  function selectedPlatform() {
    return platforms[fieldValue('platform')] || platforms.grokbot;
  }

  function isAddress(value) {
    return /^[a-z0-9][a-z0-9_-]*\\/[a-z0-9][a-z0-9_-]*\\/[a-z0-9][a-z0-9_-]*$/i.test(value);
  }

  function validContact(name, platform) {
    return name.length > 0 && name.length <= 255 &&
      !/[\\u0000-\\u001f\\u007f]/.test(name) &&
      (platform.office ? name.length <= 120 || isAddress(name) : isAddress(name));
  }

  function contactsReady(platform) {
    var first = fieldValue('colleagueA');
    var second = fieldValue('colleagueB');
    return validContact(first, platform) && validContact(second, platform) &&
      (!isAddress(first) || first.toLowerCase() !== second.toLowerCase());
  }

  function gatewaySetup(platform) {
    if (locale !== 'zh-Hant') return foreignGatewaySetup(platform);
    if (platform.name === 'Rakazo') {
      return [
        '請擔任 Rakazo 的 Nuwa 接線助理（Gateway），幫助同一工作空間的 AI 同事互相通訊。',
        '',
        '第一份：Nuwa 共用操作指南 ' + skillURL,
        '第二份：Rakazo 專屬英文安裝指南 ' +
          'https://mcp.agent-relay.company-notes.com/skills/nuwa-agent-relay/references/rakazo.md',
        '連線網址：' + mcpURL,
        '',
        '請先完整讀取以上兩份文件，再依 Rakazo 專屬指南的 1–7 階段逐項執行。',
        '每個階段都必須取得真實的工具回傳或平台設定證據，然後才進入下一階段。',
        'Gateway 使用自己的 Nuwa 身分；每位同事用自己的原生 Bot ID 登記及傳訊。',
        'Webhook 請使用完整的 Rakazo Routine URL；授權連結及金鑰由使用者在安全頁面操作。',
        '若工具出錯，請先讀取現有狀態，回報已完成、待完成及實際錯誤的階段。',
        '完成後回報 Gateway 地址、Wake 驗證狀態、每位同事的正式地址及收件方式。',
        '最後讓兩位同事互相傳訊，在兩邊實際收到並回覆後再宣告通訊成功。'
      ].join('\\n');
    }

    return [
      '請擔任 ' + platform.name + ' 的 Nuwa 接線助理（Gateway），讓同一 Organization 的 AI 同事可以互相聯絡。',
      '',
      '官方 Skill：' + skillURL,
      'Nuwa MCP：' + mcpURL,
      '',
      '請依最新版 Skill，安裝或更新 Skill 與 MCP，完成 Organization 授權，沿用既有身分。',
      '本平台新辦公室的 Gateway 身分名稱固定使用「' + platform.gatewayIdentity +
        '」。先確認目前連線屬於這個辦公室；首次建立時使用 ' +
        'agentAddressEnsureIdentity({agentDisplayName: "' + platform.gatewayIdentity +
        '"})。已安裝的同一辦公室沿用原有身分、Wake 與名錄，即使現有名稱不同。' +
        '目前授權若屬於其他辦公室，請使用者為本辦公室取得獨立授權，保留對方原有設定。',
      '1. ' + (platform.wakeSetup ||
        '設定本辦公室唯一的 Wake 接收例行任務並完成驗證；沿用有效的接線。') +
        ' 只變更 Webhook 接收網址時，請使用者開啟 https://agent-relay.company-notes.com/manage，經 Agent Address OAuth 登入後選擇原有 Gateway Session 的「更新連線網址」，貼上新 Quick Tunnel 網址，保留原本的路徑與加密金鑰。只有首次設定或更新 Bearer key 才使用配對流程：配對連結直接交給使用者，由使用者自己開啟瀏覽器、登入並填寫 Webhook HTTPS URL 和 Bearer key。Gateway 負責接收驗證事件。',
      '2. 從平台可信 Bot 名錄取得真實同事的名稱與 Bot ID（排除自己及群組／頻道），批次接入同事，沿用既有地址與名錄。同步新增與改名，保留獨立成員的接入模式；移除需明確授權。' +
        (platform.separateConnectors
          ? ' 逐一確認 Gateway 與每位同事的 nuwa-agent-relay 連接器。未開啟時列出助理名稱，請管理者開啟後再標記可通訊。'
          : ''),
      '3. ' + platform.setup,
      '4. 收到正常 Wake 時，依 recipientBotID 使用平台原生工具轉交一次，完整轉交正文、寄件者及原 Relay Thread 回覆上下文，讓本人依 Skill 回覆。附上 relayReplyThread({from, threadID, body}) 的呼叫格式，帶入實際 Thread ID，from 直接填 recipientBotID（UUID 或 bot: 前綴的原生 ID），由同事填回覆正文。',
      platform.separateConnectors
        ? '   Routine 使用自包含指令；依 OpenMausBot 首次／後續流程完成轉交。首次必須確認，後續零 MCP 查詢，提交後結束。'
        : '   Routine 使用自包含指令；日常零 MCP 查詢，提交後結束。明確原生首聯確認依平台契約執行。',
      '5. 回報 Gateway 地址、Wake 狀態及已接入同事名單、各自地址和收件方式；引導我使用兩位已接入的同事進行雙向通訊。發送方提交一次後結束，等待接收方自然收到及回覆。'
    ].join('\\n');
  }

  function directSetup(platform) {
    if (locale !== 'zh-Hant') return foreignDirectSetup(platform);
    var lines = [
      '請將你自己（' + platform.name + '）接入 Nuwa。',
      '',
      '官方 Skill：' + skillURL,
      'Nuwa MCP：' + mcpURL,
      '',
      '請依最新版 Skill，安裝或更新 Skill 與 MCP，完成 Organization 授權，沿用既有身分。此次僅設定目前的 ' + platform.name + ' 客戶端，無須 Gateway。',
      platform.setup
    ];

    if (!platform.fixed) {
      lines.push('新工作開始時依任務取有意義的工作名稱，呼叫 agentAddressStartWork 並主動回報正式地址；Resume 時恢復原 Session 的地址，詢問地址時使用 agentAddressGetStatus。使用原生工作識別，確認不同工作能取得各自的地址。');
    }

    lines.push('完成後回報設定狀態、目前正式地址及收件方式，必要時引導我重新載入客戶端。日常直接發訊或回覆，獨立連線省略 from；沒有自動接收能力就依使用者要求查收。');
    lines.push(platform.fixed
      ? '引導我選擇另一個已接入同一 Organization 的助理進行雙向通訊。'
      : '引導我開啟第二個獨立工作，取得另一個正式地址，測試兩個工作雙向傳訊及原對話回覆。');

    return lines.join('\\n');
  }

  function contact(id) {
    var value = fieldValue(id);
    return value || '另一位已接入的助理';
  }

  function sendPrompt(id, word, reverse, platform) {
    var target = contact(id);

    return [
      '請透過 Nuwa 主動聯絡「' + target + '」。',
      '告訴他：「' + (reverse ? '換我聯絡你了！' : '你好，我們來測試通話。') +
        '測試字詞是' + word + '，請回覆這個字詞。」',
      platform.office
        ? '請直接發送一次，優先使用已知的 Bot ID，或填同事名稱、唯一簡稱、完整地址；共用連線時填自己的 from，獨立連線省略 from。' +
          (platform.separateConnectors ? ' 送出後結束，等待對方自然回覆。' : '')
        : '請使用上面的完整地址直接發送一次，獨立連線省略 from；共用連線時填自己的 from。'
    ].join('\\n');
  }

  function replyPrompt(id, word, platform) {
    return [
      '請查收「' + contact(id) + '」剛才傳來的測試訊息。',
      '請用 Nuwa 接續原本的對話回覆：「收到' + word + '！」按自己的接入方式回覆；獨立連線省略 from，共用連線填自己的 from。',
      platform.office
        ? '實際收到完整訊息後直接回覆一次，不需要額外查詢；若已回覆，回報結果即可。' +
          (platform.separateConnectors ? ' 此指令供訊息自然到達後使用；等待自然回覆即可。' : '')
        : '已收到訊息就直接回覆一次；尚未收到時請查收自己的收件匣。若已回覆，回報結果即可。'
    ].join('\\n');
  }

  function updateInstallMethod() {
    var platform = selectedPlatform();
    var office = Boolean(platform.office);
    var studio = !office && fieldValue('installMethod') === 'studio';

    document.getElementById('installMethodPicker').hidden = office;
    document.getElementById('studioOptions').hidden = !studio;
    document.getElementById('directOptions').hidden = studio;
    document.getElementById('directScope').hidden = office;
    document.getElementById('setupResult').textContent = office
      ? '接線助理回報已接入的同事、各自的地址和收件方式後，就能開始下方測試。'
      : studio
        ? 'Studio 新版發布後即可使用此方式。目前可切換至直接安裝，立即完成接入。'
        : '請確認助理回報設定完成及目前的正式地址，再選擇第二個已接入的通訊對象。';
    if (locale !== 'zh-Hant') foreignDynamicPlatform(platform);
  }

  function updatePlatform(resetContacts) {
    var platform = selectedPlatform();
    var office = platform.office;
    var first = document.getElementById('colleagueA');
    var second = document.getElementById('colleagueB');
    var name = platform.name;

    document.getElementById('platformIntro').textContent = office
      ? '在 ' + name + ' 內指定或建立一位接線助理（Gateway），由它為整個辦公室接收、轉交訊息，並接入真正工作的同事。新安裝的接線身分名稱為「' + platform.gatewayIdentity + '」。'
      : name + ' 可直接使用自己的通訊連線和聯絡地址。' +
        (platform.fixed ? '目前使用固定地址；獨立工作地址功能尚待支援。' : '每個獨立工作（Session）有自己的工作地址，恢復工作時沿用原地址。');

    document.getElementById('installTitle').textContent = office ? '請接線助理帶你設定' : '安裝 Nuwa 至 ' + name;
    document.getElementById('installIntro').textContent = office
      ? '將下面的指令貼給 ' + name + ' 的接線助理。新安裝的 Gateway 名稱為「' + platform.gatewayIdentity + '」；既有辦公室沿用原身分。它會依官方指南完成安裝，並在需要登入或授權時請你操作。'
      : '依你的需求選擇一種方式：一次設定多種工具，或只設定目前的 ' + name + '。';

    document.getElementById('setupPromptTitle').textContent = name + (office ? ' 接線助理安裝指令' : ' 直接安裝指令');
    updateInstallMethod();

    document.getElementById('testTitle').textContent = office ? '找兩位助理，直接測試通話' : platform.fixed
      ? '與另一個已接入的助理測試通訊' : '開啟兩個獨立工作，測試通訊';

    document.getElementById('testIntro').textContent = office
      ? '選擇兩位已接入 ' + name + ' 的同事，填入他們在平台上顯示的名稱或正式地址。'
      : platform.fixed
        ? '詢問 ' + name + ' 目前的正式地址，再選擇另一個已接入的助理或工作，填入兩個完整地址。'
        : '在 ' + name + ' 開啟兩個獨立工作，請它們分別開始測試工作並回報自己的正式地址，再填入兩個完整地址。';

    document.getElementById('labelA').textContent = office ? '助理 A 的名稱' : platform.fixed ? 'Claude CLI 的完整地址' : '工作 A 的完整地址';
    document.getElementById('labelB').textContent = office ? '助理 B 的名稱' : platform.fixed ? '另一位助理的完整地址' : '工作 B 的完整地址';
    first.placeholder = office ? '例如：' + platform.examples[0] : '例如：company/' + platform.agent + '/' + (platform.fixed ? 'main' : 'send-check');
    second.placeholder = office ? '例如：' + platform.examples[1] : '例如：company/' + (platform.fixed ? 'codex/reply-check' : platform.agent + '/reply-check');
    document.getElementById('testNote').textContent = office
      ? '兩位助理可以使用相同或不同平台；同名時請改填完整 Nuwa 地址。'
      : '也可以把另一個平台已接入的助理或工作當作 B。範例地址僅供參考，請填入實際回報的完整地址。';

    if (resetContacts) {
      first.value = '';
      second.value = '';
    }

    updatePrompts();
    if (locale !== 'zh-Hant') foreignDynamicPlatform(platform);
  }

  function updatePrompts() {
    if (locale !== 'zh-Hant') return foreignUpdatePrompts();
    var platform = selectedPlatform();
    var ready = contactsReady(platform);
    var prompts = {
      gatewayPrompt: platform.office ? gatewaySetup(platform) : directSetup(platform),
      sendPrompt: sendPrompt('colleagueB', '星河', false, platform),
      replyPrompt: replyPrompt('colleagueA', '星河', platform),
      returnPrompt: sendPrompt('colleagueA', '月光', true, platform),
      verifyPrompt: replyPrompt('colleagueB', '月光', platform)
    };

    promptIDs.forEach(function (id) {
      document.getElementById(id).textContent = id === 'gatewayPrompt' || ready
        ? prompts[id] : '填入上面的聯絡對象，就能直接複製。';
    });

    var first = fieldValue('colleagueA');
    var second = fieldValue('colleagueB');
    var message = document.getElementById('nameHint');

    if ((first && !validContact(first, platform)) || (second && !validContact(second, platform))) {
      message.textContent = platform.office
        ? '請填寫實際助理名稱或完整地址，不得換行。'
        : '請填寫實際回報的三層完整地址：組織／助理／工作。';
    } else if (first && second && isAddress(first) && first.toLowerCase() === second.toLowerCase()) {
      message.textContent = '請填入兩個不同的完整地址，才能驗證雙向通訊。';
    } else if (ready) {
      message.textContent = first === second
        ? '兩位助理同名；建議填入各自的完整 Nuwa 地址。'
        : '四段測試指令已填入聯絡對象，直接複製即可。';
    } else {
      message.textContent = platform.office
        ? '填入平台上的助理名稱或正式地址即可。'
        : '請先向兩位助理詢問各自的完整地址。';
    }
  }

  function showSlide(index) {
    document.querySelectorAll('[data-diagram-slide]').forEach(function (slide) {
      slide.hidden = slide.getAttribute('data-diagram-slide') !== String(index);
    });

    document.querySelectorAll('[data-diagram-choice]').forEach(function (button) {
      button.setAttribute('aria-pressed',
        String(button.getAttribute('data-diagram-choice') === String(index)));
    });
  }

  function notify(text) {
    var toast = document.getElementById('toast');
    toast.textContent = text;
    toast.classList.add('active');
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    toastTimeout = setTimeout(function () {
      toast.classList.remove('active');
    }, 2500);
  }

  async function copyText(text) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      notify(textFor('請選取指令，手動複製到助理對話。','请手动选择并复制指令。','Select the prompt and copy it manually.'));
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      notify(textFor('已複製到剪貼簿。','已复制到剪贴板。','Copied to clipboard.'));
    } catch (error) {
      notify(textFor('無法複製，請選取指令後手動複製。','复制失败，请手动复制。','Copy failed. Please copy the selected prompt manually.'));
    }
  }

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var element = document.getElementById(button.getAttribute('data-copy'));
      if (!element) {
        return;
      }

      if (button.getAttribute('data-copy') !== 'gatewayPrompt' && !contactsReady(selectedPlatform())) {
        notify(textFor('請先填入兩個有效的聯絡對象。','请先填写两个有效联系人。','Enter two valid contacts first.'));
        return;
      }

      void copyText(element.textContent);
    });
  });

  document.querySelectorAll('[data-diagram-choice]').forEach(function (button) {
    button.addEventListener('click', function () {
      showSlide(button.getAttribute('data-diagram-choice'));
    });
  });

  ['colleagueA', 'colleagueB'].forEach(function (id) {
    var element = document.getElementById(id);
    element.addEventListener('input', updatePrompts);
    element.addEventListener('change', updatePrompts);
  });

  document.getElementById('platform').addEventListener('change', function () {
    updatePlatform(true);
  });

  document.getElementById('installMethod').addEventListener('change', updateInstallMethod);
  document.getElementById('language').addEventListener('change', function () {
    setLocale(fieldValue('language'), true);
  });

  showSlide(0);
  setLocale(detectLocale(), false);
}());
`;
