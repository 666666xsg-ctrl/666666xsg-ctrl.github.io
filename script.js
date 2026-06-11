const mediaRoot = "assets/user-media";
const mediaVersion = "media-2";
let pendingProjectTransition = null;

function transitionSourceRect(event, rect) {
  if (
    rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    rect.width > 8 &&
    rect.height > 8
  ) {
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  }

  const width = Math.min(420, Math.max(190, window.innerWidth * 0.24));
  const height = width * 0.58;
  const x = Number.isFinite(event?.clientX) ? event.clientX : window.innerWidth / 2;
  const y = Number.isFinite(event?.clientY) ? event.clientY : window.innerHeight / 2;

  return {
    left: x - width / 2,
    top: y - height / 2,
    width,
    height
  };
}

function openProjectWithTransition(project, meta = {}) {
  const event = meta.event || (Number.isFinite(meta.clientX) ? meta : null);
  pendingProjectTransition = {
    slug: project.slug,
    src: project.thumb,
    mediaType: project.mediaType,
    startRect: transitionSourceRect(event, meta.rect)
  };

  const targetHash = `#/projects/${project.slug}`;
  if (window.location.hash === targetHash) {
    render();
  } else {
    window.location.hash = targetHash;
  }
}

function runPendingProjectTransition(project) {
  const transition = pendingProjectTransition;
  if (!transition || transition.slug !== project.slug) return;
  pendingProjectTransition = null;

  requestAnimationFrame(() => {
    const target = app.querySelector(".project-media-inner");
    const page = app.querySelector(".project-page");
    if (!target || !page) return;

    document.querySelectorAll(".media-transition").forEach((node) => node.remove());

    const overlay = document.createElement("div");
    const media = document.createElement("img");
    const start = transition.startRect;

    overlay.className = "media-transition";
    media.src = transition.src;
    media.alt = "";
    media.decoding = "async";
    overlay.appendChild(media);
    document.body.appendChild(overlay);
    page.classList.add("is-transitioning");

    Object.assign(overlay.style, {
      left: `${start.left}px`,
      top: `${start.top}px`,
      width: `${start.width}px`,
      height: `${start.height}px`
    });

    overlay.getBoundingClientRect();

    requestAnimationFrame(() => {
      const targetRect = target.getBoundingClientRect();
      const radius = getComputedStyle(target).borderRadius || "8px";
      Object.assign(overlay.style, {
        left: `${targetRect.left}px`,
        top: `${targetRect.top}px`,
        width: `${targetRect.width}px`,
        height: `${targetRect.height}px`,
        borderRadius: radius
      });
      overlay.classList.add("is-expanded");
    });

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      page.classList.remove("is-transitioning");
      overlay.classList.add("is-complete");
      window.setTimeout(() => overlay.remove(), 180);
    };

    overlay.addEventListener("transitionend", (event) => {
      if (event.propertyName === "width" || event.propertyName === "height") finish();
    });
    window.setTimeout(finish, 900);
  });
}

function buildPrompt(item) {
  const opening =
    item.mediaType === "video"
      ? `生成一段高质量短视频，主题为「${item.title}」，属于「${item.series}」系列。`
      : `生成一张高质量视觉作品，主题为「${item.title}」，属于「${item.series}」系列。`;
  const motion =
    item.mediaType === "video"
      ? `镜头运动：${item.motion || "节奏平稳，保留主体动作的完整过程，画面有明确的起承转合和细腻的动态细节" }。`
      : `构图要求：${item.composition}。`;

  return [
    opening,
    `主体与画面：${item.subject}。${motion}`,
    `风格语言：${item.style}。色彩与光影：${item.palette}。`,
    `细节重点：${item.details}。情绪氛围：${item.mood}。`,
    "输出要求：画面清晰、主体完整、边缘干净、层次丰富，避免低清晰度、畸形肢体、错误文字、过度模糊、脏污噪点和无关水印；如果是海报或设定图，要保留完整构图、材质质感、局部特写与版式信息。"
  ].join("\n\n");
}

function createMediaItem(options) {
  const stem = options.file.replace(/\.[^.]+$/, "");
  const mediaType = options.mediaType || "image";
  const mediaSrc =
    mediaType === "video"
      ? `${mediaRoot}/videos/${options.file}`
      : `${mediaRoot}/full-webp/${stem}.webp`;

  const item = {
    title: options.title,
    year: options.year || 2026,
    slug: options.slug,
    series: options.series,
    groupPhoto: Boolean(options.groupPhoto),
    mediaType,
    mediaSrc,
    thumb: `${mediaRoot}/track/${stem}.jpg?v=${mediaVersion}`,
    description: options.summary,
    subject: options.subject,
    composition: options.composition || "主体完整居中，保留画面边界与原始比例，避免裁切关键元素",
    motion: options.motion,
    style: options.style,
    palette: options.palette,
    details: options.details,
    mood: options.mood,
    behanceUrl: "",
    styleframes: []
  };

  item.prompt = buildPrompt(item);
  return item;
}

function orderMediaItems(items) {
  const seriesOrder = [];
  const grouped = new Map();

  items.forEach((item, index) => {
    item.originalIndex = index;
    if (!grouped.has(item.series)) {
      grouped.set(item.series, []);
      seriesOrder.push(item.series);
    }
    grouped.get(item.series).push(item);
  });

  const orderedBySeries = seriesOrder.flatMap((series) =>
    grouped
      .get(series)
      .slice()
      .sort((a, b) => Number(b.groupPhoto) - Number(a.groupPhoto) || a.originalIndex - b.originalIndex)
  );

  return [
    ...orderedBySeries.filter((item) => item.groupPhoto),
    ...orderedBySeries.filter((item) => !item.groupPhoto)
  ];
}

const projects = orderMediaItems([
  createMediaItem({
    slug: "six-paths-group",
    title: "六方奇谭 合照",
    series: "六方奇谭",
    file: "six-paths-group.png",
    groupPhoto: true,
    summary: "六方奇谭系列的横幅群像合照，六位东方幻想角色在山河与墨痕之间集结。",
    subject: "六位东方幻想角色同框，包括雪原行者、曦羽祭司、影刀旅人、黯灰骑士、机铠工姬与角冠战姬，背景是远山、飞鸟、宣纸纹理与大幅墨迹旋涡",
    composition: "横幅群像构图，角色由左至右错落站位，左侧大书法标题与右侧红色印章形成视觉平衡，墨痕像环形轨迹包围人物",
    style: "国风水墨幻想设定海报，写意笔触与精细角色设计结合，带有宣纸肌理和古籍插画气质",
    palette: "米白、黑灰、青蓝、金色、少量朱红印章色",
    details: "服饰纹样、长刀、机械构件、角冠、祭司法帽、雪白坐骑、书法题字、墨点飞溅和山水留白",
    mood: "史诗、侠义、神秘、团队集结"
  }),
  createMediaItem({
    slug: "xiyu-priest",
    title: "曦羽祭司",
    series: "六方奇谭",
    file: "xiyu-priest.png",
    summary: "身披层叠羽衣的祭司角色海报，带有流光与东方书法标题。",
    subject: "女性祭司身穿米白长袍和巨大羽毛披肩，头戴青金色宽檐异形法冠，双手舒展，金色流光环绕身体",
    composition: "竖版人物全身像，人物位于画面右侧，左侧保留大幅书法标题和题跋，背景以大笔灰墨形成弧形动势",
    style: "东方水墨角色设计，轻盈羽衣、细腻线稿、水彩晕染与幻想服饰设定",
    palette: "暖米白、灰墨、青绿、淡金与少量赭色",
    details: "羽毛层次、帽冠纹样、金色飘带、长袍褶皱、印章、宣纸纹理",
    mood: "神圣、静谧、飘逸、仪式感"
  }),
  createMediaItem({
    slug: "snowfield-walker",
    title: "雪原行者",
    series: "六方奇谭",
    file: "snowfield-walker.png",
    summary: "白色雪原旅人和大型白犬坐骑的水墨角色设定。",
    subject: "白衣雪原行者披着厚重斗篷，头戴兽耳式兜帽，身旁是一只巨大白色犬类坐骑，背上有小伙伴挥舞流星锤",
    composition: "竖版全身角色与坐骑组合，人物居中偏左，坐骑占据右侧，左边书法标题向下排列",
    style: "国风水墨幻想设定，厚重服饰与可爱奇幻伙伴并置，兼具写意和细节",
    palette: "雪白、灰墨、暗金、深蓝与淡青",
    details: "毛绒披风、几何裤装纹样、犬类毛发、挂穗、流星锤、墨痕背景",
    mood: "寒冷、自由、旅途感、可靠伙伴"
  }),
  createMediaItem({
    slug: "shadow-blade-traveler",
    title: "影刀旅人",
    series: "六方奇谭",
    file: "shadow-blade-traveler.png",
    summary: "携带巨型弯刀的灰黑色游侠角色海报。",
    subject: "成熟女性旅人披着黑灰斗篷和头巾，穿蓝色长裤、绑带长靴，手扶腰间，身后拖着巨大弯刀",
    composition: "竖版全身像，人物站在画面右侧偏中，巨型刀刃从左下向右上形成强动线",
    style: "水墨奇幻角色设计，流浪者服饰、异域饰品与锋利武器结合",
    palette: "灰黑、石青、棕色皮革、米白宣纸",
    details: "面纱、项链、孔雀蓝羽饰、皮革护臂、刀刃磨损、墨点和书法标题",
    mood: "冷静、危险、自由、神秘"
  }),
  createMediaItem({
    slug: "dark-grey-knight",
    title: "黯灰骑士",
    series: "六方奇谭",
    file: "dark-grey-knight.png",
    summary: "黑羽披风与长剑构成的冷峻骑士设定。",
    subject: "白发骑士穿黑灰盔甲与皮革战装，披风像黑羽向后展开，手持长剑，腰侧带盾牌",
    composition: "竖版全身像，人物偏右站立，剑身从右下指向画面中心，左侧书法标题留白",
    style: "东方水墨与中世纪骑士混合的角色设定，线稿精致、材质丰富",
    palette: "黑灰、冷白、暗金、石青与铁锈红",
    details: "肩甲、披风羽毛、长剑反光、腰带挂件、盾牌铆钉、靴子和墨痕",
    mood: "孤高、克制、肃杀、守护"
  }),
  createMediaItem({
    slug: "mech-armor-princess",
    title: "机铠工姬",
    series: "六方奇谭",
    file: "mech-armor-princess.png",
    summary: "机械齿轮与蒸汽朋克护具组成的工姬角色。",
    subject: "短发女性机械工姬戴皮帽，穿黑色短上衣、红色工装裤和高筒靴，右臂装有大型机械护臂，身后是齿轮与巨型扳手结构",
    composition: "竖版全身像，人物重心偏右，机械臂与齿轮在背后形成复杂轮廓",
    style: "水墨蒸汽朋克角色设定，工业机械细节与国风笔触结合",
    palette: "黑灰、锈铜、暗红、皮革棕与宣纸米白",
    details: "铆钉、齿轮、链条、护臂液压结构、工装裤拉链、飞散墨点",
    mood: "硬朗、叛逆、机械感、行动力"
  }),
  createMediaItem({
    slug: "horn-crown-warrior",
    title: "角冠战姬",
    series: "六方奇谭",
    file: "horn-crown-warrior.png",
    summary: "巨大角冠与荒原服饰构成的战姬设定。",
    subject: "女性战姬佩戴横向巨大角冠，白色夸张袖甲与黑色腿部装束形成强烈对比，身上悬挂青橙色珠饰与流苏",
    composition: "竖版全身像，人物居中正面站立，角冠横向展开强化剪影，水墨背景围绕身体升腾",
    style: "部落幻想与东方水墨结合的角色设计，夸张头饰、强剪影、手绘质感",
    palette: "米白、黑色、青蓝、橙色、灰墨",
    details: "角冠纹样、毛绒袖口、珠串、腰饰、黑色长腿比例、红色印章",
    mood: "野性、庄严、强势、荒原仪式感"
  }),
  createMediaItem({
    slug: "legends-assembled",
    title: "传奇集结 合照",
    series: "永恒回响",
    file: "legends-assembled.png",
    groupPhoto: true,
    summary: "永恒回响角色群像合照，六位角色在暗金电影海报中集结。",
    subject: "六名不同身份的角色同框，包括街头反叛者、猎影者、边域巡界者、天命女祭司、圣光骑士和御纱剑姬",
    composition: "宽幅电影群像海报，中心人物坐姿压住画面重心，其他角色环绕站位，超大英文标题和中文题字分布在左右",
    style: "暗黑奇幻商业海报，写实厚涂角色、玻璃碎片、金色线框和高对比排版",
    palette: "黑色、暗金、白银、红色、荧光绿与皇家蓝",
    details: "角色武器、盔甲、丝带、枪械、弓箭、晶体碎片、标语文字和底部系列信息",
    mood: "燃、史诗、团队集结、命运感"
  }),
  createMediaItem({
    slug: "anden-paladin",
    title: "亚登 圣光骑士",
    series: "永恒回响",
    file: "anden-paladin.png",
    summary: "白金盔甲圣骑士角色海报，包含多张局部特写。",
    subject: "青年圣骑士穿银白与金色重甲，手持长剑，肩甲尖锐，胸甲有华丽纹章，背景包含角色半身与装备特写框",
    composition: "竖版角色海报，主角站在右侧，左侧巨型英文标题与红色手写字叠加，多个金框局部图形成版式层次",
    style: "暗黑高端角色海报，厚涂写实、商业游戏设定、金属材质极细",
    palette: "黑、白银、亮金、深蓝、红色签名字",
    details: "盔甲反光、剑柄宝石、局部插图框、破碎晶体、中文题字和英文誓词",
    mood: "荣耀、守护、庄严、贵族骑士感"
  }),
  createMediaItem({
    slug: "yun-zhao-oracle",
    title: "云昭 天命巫祝",
    series: "永恒回响",
    file: "yun-zhao-oracle.png",
    summary: "红金东方神谕角色海报，带有华丽法器和符纸动势。",
    subject: "女性神谕角色身穿红黑金层叠礼服，头戴复杂金色冠饰，手持长柄法器，周围有符纸与红色能量流",
    composition: "竖版正面海报，主角居中偏右，左侧英文大字与局部侧脸、背面、腰饰特写组成版式",
    style: "东方神话与暗黑商业海报结合，写实厚涂、华丽服装设定、金色装饰高密度",
    palette: "黑色、深红、金色、青绿点缀",
    details: "冠饰链坠、红色飘带、符纸、法器、金属纹样、局部特写框",
    mood: "神圣、威严、命定、压迫感"
  }),
  createMediaItem({
    slug: "aurelia-regal-veil",
    title: "奥蕾莉亚 御纱之刃",
    series: "永恒回响",
    file: "aurelia-regal.png",
    summary: "蓝金女剑士角色海报，背部姿态优雅且带强烈贵族气质。",
    subject: "金发高马尾女剑士回身站立，穿蓝金露背礼装与金色肩饰，双手持细剑，长丝带向外飘散",
    composition: "竖版角色海报，主角背部大面积占据画面中心，左侧巨型英文标题与多个局部特写框叠加",
    style: "暗黑华丽游戏角色海报，写实厚涂、金属与丝绸材质突出",
    palette: "黑色、亮金、深蓝、肤色高光与红色签名",
    details: "金属肩饰、细剑、丝带、发冠、背部线条、玻璃碎片和中英文字",
    mood: "优雅、危险、王权、锋利"
  }),
  createMediaItem({
    slug: "cain-frontier-scout",
    title: "凯恩 边域巡界者",
    series: "永恒回响",
    file: "cain-frontier.png",
    summary: "白色荒漠侦察者角色海报，人物蹲姿与沙尘氛围明显。",
    subject: "年轻男性巡界者穿白色战术外套与防护服，蹲在荒漠岩地上，神情冷峻，背景有多张沙地与肩章特写",
    composition: "竖版海报，人物位于右侧大比例蹲姿，左侧英文大字压住背景，金框特写图环绕主体",
    style: "暗黑科幻荒漠角色海报，写实厚涂、战术服装、电影级沙尘质感",
    palette: "黑褐、沙金、灰白、暗青",
    details: "白色靴子、防护外套、绳索肩章、荒地坐标、局部特写框、中英标语",
    mood: "孤独、侦察、边境、坚韧"
  }),
  createMediaItem({
    slug: "rook-hunter-instinct",
    title: "洛克 狩猎本能",
    series: "永恒回响",
    file: "rook-hunter.png",
    summary: "现代弓手角色海报，荧光绿弓弦形成强烈视觉线条。",
    subject: "男性猎手戴黑色帽盔和护目结构，身穿棕黑战术服与荧光绿背包，拉开机械弓，绿色弓弦贯穿画面",
    composition: "竖版动作海报，弓箭横向穿过上半画面，主角向右拉弓，多个局部特写框叠在背景中",
    style: "暗黑未来猎手海报，动漫厚涂、机械武器、碎片玻璃与商业排版",
    palette: "黑色、暗金、荧光绿、棕色、红色签名",
    details: "机械弓、绿色箭线、背包、帽盔纹样、角色眼神、英文标题和中文竖排字",
    mood: "专注、速度、狩猎、紧张"
  }),
  createMediaItem({
    slug: "mambai-rebel-pulse",
    title: "曼芭 自由脉冲",
    series: "永恒回响",
    file: "mambai-rebel.png",
    summary: "街头反叛者角色海报，运动夹克、枪械和蓝色耳机线构成动势。",
    subject: "短发女性街头角色穿黑白红运动夹克和短裤，腰间黄色战术包，手持大型枪械，蓝色耳机线从嘴边延伸到手指",
    composition: "竖版低角度海报，人物由下向上占满画面，左侧英文标题和多个金框特写形成街头杂志式排版",
    style: "暗黑街头动作角色海报，写实厚涂、潮流服装、碎片光效",
    palette: "黑色、红白、黄色装备、蓝色线条、金色火花",
    details: "枪械、指甲、耳机线、运动夹克褶皱、腰包、局部特写框和标语",
    mood: "自由、叛逆、节奏感、都市战斗"
  }),
  createMediaItem({
    slug: "fantasy-vehicles-cover",
    title: "幻想载具结构志 封面合集",
    series: "幻想载具结构志",
    file: "fantasy-vehicles-cover.png",
    groupPhoto: true,
    summary: "十二款幻想载具结构志封面合集，展示多个机械载具概念。",
    subject: "十二格载具合集海报，包含留声机步行车、空塔之塔、荒漠行者、鸡蛋小巴、黑色流线车、越野四驱、星穹机甲、工程车、香料商旅车、越野摩托、云堡炮艇和负重探索机",
    composition: "大幅横版网格海报，顶部巨型中文标题，十二个编号画格均匀排列，底部有口号和装饰符号",
    style: "复古科幻设定集封面，工业设计、机械插画、海报排版与档案图鉴风格",
    palette: "黑色、米色、橙色、蓝灰、复古金属色",
    details: "编号、英文小标题、机械轮廓、载具材质、网格分区、条码和装饰线",
    mood: "收藏感、设定集、探索、想象力"
  }),
  createMediaItem({
    slug: "fantasy-vehicle-01",
    title: "野途 负载型机动载具",
    series: "幻想载具结构志",
    file: "fantasy-vehicle-01.png",
    summary: "四足负载机动载具结构图，带技术标注和维修场景。",
    subject: "一台四足机械负载载具，背部堆放行李包和储物袋，旁边工程师正在维护侧面设备",
    composition: "竖版结构解析图，主载具占据中心，上下分布腿部拆解、侧剖图、规格参数和设计要点",
    style: "工业概念设计图、机甲载具剖析、中文技术图鉴版式",
    palette: "米白纸底、沙色装甲、深灰机械、橙色零件、绿色工具箱",
    details: "传感器、照明单元、四肢关节、内部货舱、液压支撑点、规格表、标注线",
    mood: "实用、可靠、远行、工程理性"
  }),
  createMediaItem({
    slug: "fantasy-vehicle-03",
    title: "重型悬浮炮艇 XH-47 雷渊",
    series: "幻想载具结构志",
    file: "fantasy-vehicle-03.png",
    summary: "重型悬浮炮艇结构图，展示武装模块与推进系统。",
    subject: "大型灰黑色悬浮炮艇，机身展开可变装甲片，内部机械舱和主武器系统清晰可见",
    composition: "竖版技术解析，主载具占据上半区域，下方是推进系统爆炸视图、后视图、俯视图和规格表",
    style: "硬表面科幻飞船设定图，军事工业设计、精密线框标注",
    palette: "灰黑金属、米白背景、橙红警示灯、青绿色屏幕",
    details: "炮管、装甲片、能量舱、垂直升力单元、推进喷口、模块化接口、中文标注",
    mood: "重型、战术、冷峻、技术感"
  }),
  createMediaItem({
    slug: "fantasy-vehicle-04",
    title: "HX-827 重型混合动力工程车",
    series: "幻想载具结构志",
    file: "fantasy-vehicle-04.png",
    summary: "重型工程车结构解析，半轮式半履带底盘与红色后部模块突出。",
    subject: "白色重型混合动力工程车，前部双大轮、后部履带推进、裸露液压管线与红色动力模块",
    composition: "竖版工程解析，主车三分之二视角居中，下方展示技术规格、剖视动力布局、功能模块和外形视图",
    style: "未来工程车辆设定图，工业设计、机械剖析、中文说明书版式",
    palette: "象牙白、机械灰、橙色管线、红色后舱、米色纸底",
    details: "驾驶舱、混合动力总成、液压系统、履带推进、车架结构、尺寸标注",
    mood: "坚固、工程、救援、模块化"
  }),
  createMediaItem({
    slug: "fantasy-vehicle-05",
    title: "香料行商旅车",
    series: "幻想载具结构志",
    file: "fantasy-vehicle-05.png",
    summary: "移动香料市场旅车结构图，车体兼具生活空间与摊铺展示。",
    subject: "复古木质香料行商车，带遮阳伞、屋顶行李、侧面香料摊位、木轮和蒸汽烟囱",
    composition: "竖版图鉴，主车占据中心，四周标注驾驶舱、商铺展示区、香料储物系统和屋顶结构分解",
    style: "奇幻商旅车设定、蒸汽朋克市集、温暖手绘工业插画",
    palette: "暖棕木色、青绿色车厢、金黄遮阳棚、米色背景",
    details: "香料袋、瓶罐、招牌、木轮、屋顶伞、底盘半剖、内部储物剖视",
    mood: "温暖、旅行、市集、生活气"
  }),
  createMediaItem({
    slug: "fantasy-vehicle-09",
    title: "D-01 蛋运小巴",
    series: "幻想载具结构志",
    file: "fantasy-vehicle-09.png",
    summary: "鸡蛋运输小巴结构解析图，外形可爱且带完整储蛋结构。",
    subject: "鸡形小巴载具，圆润木质车顶像蛋壳仓，侧面展示多层鸡蛋货架，车头有鸟嘴造型",
    composition: "竖版产品结构图，主载具三分之二视角在上方，下方展示储蛋详解、结构分解和技术参数",
    style: "可爱工业产品设定、玩具感交通工具、干净图鉴排版",
    palette: "奶油黄、木棕、黑色包边、蛋壳白、淡灰背景",
    details: "鸡冠、尾羽稳定翼、Fresh Eggs标牌、蛋架、车窗、轮组、爆炸图",
    mood: "可爱、实用、轻松、童趣"
  }),
  createMediaItem({
    slug: "fantasy-vehicle-11",
    title: "留声机步行载具",
    series: "幻想载具结构志",
    file: "fantasy-vehicle-11.png",
    summary: "留声机形态的步行机械载具结构解析。",
    subject: "一台带巨大留声机喇叭的四足步行载具，机身为铜色机械舱，前端像鸟嘴，中央有座椅与能量舱",
    composition: "竖版设定图，主载具居中偏右，周围用标注线说明声学收集喇叭、驾驶座、机械足和内部结构",
    style: "蒸汽朋克机械设定、复古音乐装置与奇幻交通工具结合",
    palette: "铜色、黄铜、深蓝机舱、灰白背景",
    details: "喇叭内部结构、机械足关节、能量舱蓝光、爆炸结构、三视图",
    mood: "复古、奇妙、音乐机械、探索感"
  }),
  createMediaItem({
    slug: "pajama-alliance",
    title: "睡衣联盟 合照",
    series: "睡衣联盟",
    file: "pajama-alliance.png",
    groupPhoto: true,
    summary: "睡衣联盟IP角色合照，六个毛绒睡衣角色站成一排。",
    subject: "六个可爱儿童IP角色穿不同动物睡衣，包括恐龙、兔子、小猫、鲨鱼、小熊和星星宇航角色",
    composition: "横幅合照，角色从左到右排成一线，上方大标题和品牌字样，下方有角色名与圆形图标",
    style: "AIGC原创IP设定，3D毛绒玩具质感，儿童品牌视觉",
    palette: "奶油桃色背景、绿色、粉色、紫色、蓝色、棕色与暖白",
    details: "毛绒睡衣、动物帽牙齿、星月图标、角色标签、版权信息和可爱表情",
    mood: "甜美、童趣、温暖、梦幻"
  }),
  createMediaItem({
    slug: "dino-boy",
    title: "Dino Boy 角色设定",
    series: "睡衣联盟",
    file: "dino-boy.png",
    summary: "恐龙男孩IP角色三视图、表情与周边设定。",
    subject: "可爱小男孩穿绿色恐龙连体睡衣，展示正面、侧面、背面和不同姿势，右侧有配色板",
    composition: "横版角色设定板，上方是多角度三视图，下方分区展示姿势、配件和表情",
    style: "3D萌系IP角色设计，玩具质感、品牌设定图、干净商业排版",
    palette: "绿色、浅草绿、奶油白、深棕和米色背景",
    details: "恐龙帽、白色牙齿、背部尖刺、尾巴、书本、背包、水杯、表情头像",
    mood: "可爱、亲和、童年、品牌化"
  }),
  createMediaItem({
    slug: "dino-boy-stickers",
    title: "Dino Boy 表情包",
    series: "睡衣联盟",
    file: "dino-boy-stickers.png",
    summary: "恐龙男孩九宫格贴纸表情包。",
    subject: "九个Dino Boy透明贴纸姿态，包括委屈、思考、胜利、愤怒、无语、大笑、犯困、石化惊讶和吃饭",
    composition: "九宫格贴纸合集，透明棋盘背景，每个贴纸有白色描边和轻微投影",
    style: "3D卡通贴纸包，可爱IP表情设计，社交媒体素材",
    palette: "绿色恐龙服、浅绿肚皮、白色描边、灰白透明格",
    details: "不同表情、姿势、餐碗、椅子、气泡符号、石化灰色变体",
    mood: "活泼、好玩、表情丰富、可传播"
  }),
  createMediaItem({
    slug: "dino-boy-merch",
    title: "Dino Boy 周边图",
    series: "睡衣联盟",
    file: "dino-boy-merch.png",
    summary: "Dino Boy品牌周边合集场景。",
    subject: "Dino Boy角色应用在帆布袋、购物袋、手机壳、马克杯、滑板、雨伞、抱枕、日历、贴纸和文具上",
    composition: "横版产品陈列场景，多件周边在浅绿色品牌背景前分层摆放，中心有Dino Boy标志",
    style: "儿童IP商业周边摄影棚渲染，清新品牌视觉和产品陈列",
    palette: "浅绿、深绿、奶油白、米色、少量植物绿",
    details: "品牌logo、产品印花、吊牌、贴纸、日历页、雨伞包装、滑板图案",
    mood: "商业化、治愈、童趣、完整品牌体系"
  }),
  createMediaItem({
    slug: "dark-fantasy-ensemble",
    title: "暗黑幻想角色群像 合照",
    series: "暗黑角色设定",
    file: "dark-fantasy-ensemble.png",
    groupPhoto: true,
    summary: "暗黑幻想角色的多人合照，神话、战士与现代战术角色混合。",
    subject: "七名暗黑幻想角色站在废墟前，包括黑袍男子、白发战术少女、黑金贵族、翼人、红甲武者、蓝纹战士和黄金女王",
    composition: "竖版群像合照，人物紧密站位形成三角层级，中央黑衣男性压住视觉中心，背景是破败建筑和烟尘",
    style: "写实电影级角色设定，暗黑奇幻与时装混搭，超高细节厚涂",
    palette: "黑灰、金色、白色、红色盔甲、烟雾暖光",
    details: "斗篷、金色纹章、翅膀、盔甲、面具、纹身、战术服、废墟光影",
    mood: "阴郁、史诗、危险、命运共同体"
  }),
  createMediaItem({
    slug: "hooded-vagabond-design",
    title: "黑袍流浪者设定",
    series: "暗黑角色设定",
    file: "hooded-vagabond-design.png",
    summary: "黑袍男性角色多视图设定，包含面部特写与前侧后视图。",
    subject: "赤裸上身的男性流浪者披黑色长斗篷，胸前有纹身与金属链饰，手持长剑，穿灰色裤子和黑色长靴",
    composition: "角色设定板，左侧是面部近景，右侧依次展示正面、侧面和背面全身视图",
    style: "写实3D角色设计、服装设定、暗黑奇幻时装",
    palette: "黑色皮革、金边、灰色裤装、肤色与白底",
    details: "面部纹身、胸口纹样、金色肩甲、斗篷背面图案、剑柄和长靴褶皱",
    mood: "危险、孤独、邪性、流浪"
  }),
  createMediaItem({
    slug: "tribal-axe-warrior-design",
    title: "蓝纹斧战士设定",
    series: "暗黑角色设定",
    file: "tribal-axe-warrior-design.png",
    summary: "带蓝色战纹和双斧的部落女战士多视图设定。",
    subject: "女性战士脸上有蓝色颜料纹路，编发，穿羽毛皮革与金属圆饰甲，手持双斧，展示前侧背多角度",
    composition: "左侧大头特写，右侧四个全身视图横向排列，白底角色设定板",
    style: "写实幻想角色设计，部落战士、皮草、金属饰物与武器设定",
    palette: "灰棕皮革、蓝色战纹、古铜金属、冷白背景",
    details: "蓝色脸纹、编发、獠牙项圈、双斧、羽毛披肩、腰间挂饰",
    mood: "野性、坚韧、战斗、古老部族"
  }),
  createMediaItem({
    slug: "red-armored-wanderer-design",
    title: "红甲游侠设定",
    series: "暗黑角色设定",
    file: "red-armored-wanderer-design.png",
    summary: "红黑银武者风角色多视图设定。",
    subject: "女性游侠佩戴红色头带和银色冠饰，穿红黑不对称长衣、银色肩甲和腿甲，展示近景、正面、侧面、背面",
    composition: "白底角色设定板，左侧脸部大特写，右侧多角度全身站姿",
    style: "写实东方幻想角色设计，武者服饰、银甲、红黑布料",
    palette: "红色、黑色、银色、米白布料、金色挂饰",
    details: "头饰、耳坠、肩甲花纹、红色披片、腰带、靴甲、背面布料层次",
    mood: "冷艳、游侠、精致、武者感"
  }),
  createMediaItem({
    slug: "orange-winged-serpent-design",
    title: "橙袍翼蛇使设定",
    series: "暗黑角色设定",
    file: "orange-winged-serpent-design.png",
    summary: "带黑翼和黑蛇的橙袍男性角色设定。",
    subject: "男性角色穿橙色兜帽与红色铠甲，背后展开巨大黑色羽翼，手中盘绕黑蛇，腰间有武器",
    composition: "白底角色设定板，左侧近景头像，右侧多角度全身展示，包括背面翅膀结构",
    style: "写实神话角色设计，天狗或堕天使气质，东方武者盔甲",
    palette: "橙色兜帽、红色甲片、黑色羽翼、金色扣件",
    details: "蛇鳞、羽翼层次、红甲铆钉、面部红角、绳结、腰刀",
    mood: "诡秘、危险、神话、禁忌"
  }),
  createMediaItem({
    slug: "white-tactical-girl-design",
    title: "白发战术少女设定",
    series: "暗黑角色设定",
    file: "white-tactical-girl-design.png",
    summary: "白发白色战术服少女多视图角色设定。",
    subject: "白发少女穿全白未来战术服、灰色背心和高帮运动靴，橙色眼睛，展示面部特写和前侧背视图",
    composition: "白底角色设定板，左侧大面积肖像特写，右侧四个全身角度并排",
    style: "近未来战术服装设计，写实3D角色设定，干净高调影棚光",
    palette: "白色、浅灰、少量橙色、冷白背景",
    details: "短白发、透明感皮肤、防护背带、宽松袖口、裤装开口、鞋底橙色点缀",
    mood: "冷淡、未来、清洁、脆弱与力量并存"
  }),
  createMediaItem({
    slug: "black-robe-noble-design",
    title: "黑袍贵族设定",
    series: "暗黑角色设定",
    file: "black-robe-noble-design.png",
    summary: "黑金贵族男性多视图角色设定。",
    subject: "青年男性穿黑色长袍与披风，胸前有金色神圣纹章和宝石链饰，展示正侧背面和肖像特写",
    composition: "白底设定板，左侧大头与胸口纹样特写，右侧多角度全身图",
    style: "哥特贵族服装设计、宗教纹章、写实角色设定",
    palette: "黑色、暗金、祖母绿宝石、冷白底",
    details: "高领、金色花纹、斗篷背面十字纹、手套、腰链、皮靴",
    mood: "高贵、冷峻、神秘、权力感"
  }),
  createMediaItem({
    slug: "gold-horned-empress-design",
    title: "金角女王设定",
    series: "暗黑角色设定",
    file: "gold-horned-empress-design.png",
    summary: "黑金女王角色多视图设定，头冠、面链和金色盔甲极为华丽。",
    subject: "女性女王穿黑色垂坠长裙，佩戴金色羊角头冠、面链、狮形肩甲和金色腿甲，展示正侧背面",
    composition: "白底设定板，左侧大幅半身特写，右侧多角度全身展示",
    style: "暗黑神话女王设定，奢华金属盔甲、时装化礼服、写实渲染",
    palette: "黑色、古金、红宝石、肤色高光",
    details: "羊角头冠、流苏面链、狮头肩甲、太阳胸饰、金属腿甲、黑色纱裙",
    mood: "威严、神秘、奢华、女王气场"
  }),
  createMediaItem({
    slug: "winter-forest-sun",
    title: "雪林金阳",
    series: "自然光影",
    file: "winter-forest-sun.png",
    summary: "雪林中太阳穿过树干形成金色光束。",
    subject: "冬季针叶林被厚雪覆盖，太阳从树干缝隙中射出强烈金色光芒，雪地小路向远处延伸",
    composition: "竖版风景摄影，太阳位于画面中部偏左，树干形成垂直节奏，雪路引导视线深入画面",
    style: "电影感自然风景摄影，真实光线、体积光、高清细节",
    palette: "冷蓝雪色、深棕树干、金色阳光、暗绿针叶",
    details: "雪面脚印、树枝积雪、光柱、雾气、远处林间层次",
    mood: "宁静、寒冷、希望、清晨"
  }),
  createMediaItem({
    slug: "rain-ripples-night",
    title: "夜雨涟漪",
    series: "自然光影",
    file: "rain-ripples-night.png",
    summary: "雨滴落在深色水面形成层层涟漪和城市倒影。",
    subject: "暗色雨水表面，密集圆形涟漪扩散，蓝色和橙色城市灯光在水面反射",
    composition: "竖版微距俯视，水面纹理铺满画面，明暗区域斜向分布形成深度",
    style: "电影级微距摄影，写实水面材质，低调高反差",
    palette: "深蓝、黑色、橙色灯光、冷白反光",
    details: "水滴波纹、反射畸变、微小气泡、湿润纹理、暗部层次",
    mood: "安静、潮湿、都市夜晚、沉思"
  }),
  createMediaItem({
    slug: "red-eclipse-silhouette",
    title: "赤日暮影",
    series: "自然光影",
    file: "red-eclipse-silhouette.png",
    summary: "巨大红色落日、云层与树枝剪影构成的戏剧化风景。",
    subject: "暗红天空中巨大的红色太阳即将落下，两只飞鸟掠过日面，前景是黑色树枝剪影",
    composition: "横版居中构图，红日占据画面中央，树冠剪影从底部托起，云层环绕太阳",
    style: "超现实电影风景，暗黑日暮、强烈色彩、剪影摄影",
    palette: "血红、暗紫、黑色、橙红云边光",
    details: "飞鸟剪影、树枝细线、厚重云层、太阳轮廓、暗部渐变",
    mood: "壮观、压抑、末世、神秘"
  }),
  createMediaItem({
    slug: "lone-tree-golden-field",
    title: "孤树金野",
    series: "自然光影",
    file: "lone-tree-golden-field.png",
    summary: "夕阳草地山丘上的孤树风景。",
    subject: "开阔草原山丘上有一棵孤树，夕阳从左侧低处照入，天空布满云层和金色边光",
    composition: "竖版广角风景，前景草叶虚化，中景小丘与孤树居中，天空占据大面积空间",
    style: "电影级自然摄影，广角镜头、浅景深前景、真实光影",
    palette: "金色夕阳、草地绿、天空蓝灰、暖橙云光",
    details: "草叶高光、远山、水面反射、云层结构、孤树剪影",
    mood: "自由、辽阔、温暖、孤独"
  }),
  createMediaItem({
    slug: "glowing-red-peony",
    title: "灼光牡丹",
    series: "自然光影",
    file: "glowing-red-peony.png",
    summary: "近距离发光红牡丹微距花朵。",
    subject: "一朵红橙色牡丹近距离盛开，花心强烈发光，后方有深色花瓣和蓝色冷调背景",
    composition: "竖版微距，主花占据右下与中心，花瓣层层向外展开，背景虚化",
    style: "奇幻花卉微距摄影，半透明花瓣、电影光效、极高质感",
    palette: "红色、橙金、深酒红、冷蓝背景",
    details: "花瓣纹理、花蕊、露珠感高光、微小光粒、柔和景深",
    mood: "炽热、华丽、生命力、梦幻"
  }),
  createMediaItem({
    slug: "emerald-violinist",
    title: "翡翠小提琴家",
    series: "音乐主题",
    file: "emerald-violinist.png",
    summary: "宫廷室内拉小提琴的女性音乐家，裙摆上有音乐符号。",
    subject: "女性小提琴家坐在古典宫廷椅上，穿深翡翠绿色礼服，头发与裙摆中飘散黑色五线谱和音符",
    composition: "竖版室内肖像，人物侧坐于画面中心，窗光从右侧进入，裙摆铺满下方空间",
    style: "华丽古典音乐幻想摄影，写实人物、巴洛克室内、音符特效",
    palette: "深翡翠绿、金色装饰、暖窗光、黑色音符",
    details: "小提琴、琴弓、礼服纱层、发丝音符、镜框、窗帘、花瓶",
    mood: "优雅、沉浸、古典、音乐流动"
  }),
  createMediaItem({
    slug: "red-music-dancer",
    title: "红裙音符舞者",
    series: "音乐主题",
    file: "red-music-dancer.png",
    summary: "剧场红裙女性舞者，黑色音符从裙摆和发间升起。",
    subject: "女性舞者坐在剧场舞台前，穿夸张红色蓬纱礼服，头发与裙摆周围有黑色音符旋涡",
    composition: "竖版肖像，人物偏右低头，红裙占据下半画面，左侧有空舞台和右侧红幕",
    style: "戏剧舞台幻想摄影，时装大片、音乐符号特效、低调暖光",
    palette: "深红、黑色、暖金剧场光、肤色高光",
    details: "红色纱裙层次、黑色音符、剧院包厢、红幕、发丝和手臂姿态",
    mood: "戏剧、浪漫、孤独、强烈情绪"
  }),
  createMediaItem({
    slug: "harp-garden-musician",
    title: "花园竖琴少女",
    series: "音乐主题",
    file: "harp-garden-musician.png",
    summary: "玻璃花园中弹竖琴的浅粉礼服少女。",
    subject: "女性竖琴演奏者穿浅粉花朵礼服，在明亮植物温室里弹奏象牙色竖琴，黑色音符带环绕身体",
    composition: "竖版侧面构图，竖琴位于右侧高耸，人物坐姿居中，裙摆向左下方展开",
    style: "梦幻婚纱音乐摄影，温室自然光、柔美花卉礼服、幻想音符",
    palette: "奶油白、淡粉、植物绿、暖金阳光、黑色音符",
    details: "竖琴琴弦、花瓣礼服、耳饰、植物背景、音符曲线、柔和高光",
    mood: "纯净、梦幻、温柔、晨光"
  }),
  createMediaItem({
    slug: "white-piano-muse",
    title: "白色钢琴缪斯",
    series: "音乐主题",
    file: "white-piano-muse.png",
    summary: "白衣男性钢琴演奏者，黑色音符环绕身体。",
    subject: "年轻男性穿白色西装与透明荷叶边衬衫，坐在黑色钢琴旁弹奏，黑色五线谱和音符从琴键周围升起",
    composition: "竖版室内低调构图，钢琴位于左侧，人物坐姿偏右，音符曲线穿过人物和背景",
    style: "冷调时尚音乐摄影，写实肖像、超现实音符特效、黑白高反差",
    palette: "白色服装、黑色钢琴、冷灰背景、黑色音符",
    details: "钢琴键、荷叶边衬衫、音符旋涡、窗光、坐姿、手部动作",
    mood: "安静、优雅、孤独、现代古典"
  }),
  createMediaItem({
    slug: "teal-street-portrait",
    title: "青绿色街头笑容",
    series: "街头肖像",
    file: "teal-street-portrait.png",
    summary: "带青绿色发尾和闪电脸绘的街头女孩近景。",
    subject: "短发女孩在涂鸦墙前大笑，黑发带青绿色挑染，脸上有蓝色闪电脸绘，穿黄色帽衫和黑色牛仔外套",
    composition: "竖版超近距离肖像，脸部填满画面，背景涂鸦虚化，夕阳逆光打在发丝上",
    style: "街头纪实肖像摄影，真实皮肤纹理、自然笑容、浅景深",
    palette: "暖黄、黑色牛仔、青绿色发尾、夕阳橙光",
    details: "雀斑、鼻环、脸绘、牙齿笑容、帽衫织物、涂鸦背景",
    mood: "青春、自由、快乐、街头感"
  }),
  createMediaItem({
    slug: "red-hood-street-portrait",
    title: "红帽街头少年",
    series: "街头肖像",
    file: "red-hood-street-portrait.png",
    summary: "卷发少年在霓虹街头的近景肖像。",
    subject: "卷发少年穿红色帽衫和旧皮夹克，脸上有橙色点状脸绘和黑色星形小纹身，蓝色眼睛看向镜头",
    composition: "竖版近景肖像，脸部居中略偏右，粉蓝霓虹背景虚化",
    style: "街头时尚肖像摄影，夜间霓虹、浅景深、真实皮肤质感",
    palette: "红色帽衫、墨绿夹克、粉色霓虹、冷蓝背景",
    details: "卷发、浓眉、眼睛高光、脸部小图案、夹克拉链、背景光斑",
    mood: "叛逆、安静、都市夜色、少年感"
  }),
  createMediaItem({
    slug: "silver-jacket-portrait",
    title: "银色夹克月妆肖像",
    series: "街头肖像",
    file: "silver-jacket-portrait.png",
    summary: "金黑短发女孩的银色夹克棚拍肖像。",
    subject: "短发女孩金色发丝与黑色发根形成对比，脸颊有淡紫色月亮妆，穿银色反光夹克和深灰高领",
    composition: "竖版近景肖像，人物头部和肩部占据画面，背景是柔和粉紫色工作室图案",
    style: "时尚美容肖像摄影，干净皮肤质感、金属服装、柔和自然光",
    palette: "银色、金发、黑色高领、淡紫、粉色背景",
    details: "月亮脸绘、闪亮夹克褶皱、发丝层次、唇部高光、眉形",
    mood: "自信、未来感、轻盈、时尚"
  }),
  createMediaItem({
    slug: "greenhouse-leaf-portrait",
    title: "温室叶纹少年",
    series: "街头肖像",
    file: "greenhouse-leaf-portrait.png",
    summary: "温室中带叶片脸绘的黑发少年肖像。",
    subject: "黑发少年站在植物温室中，脸颊有绿色叶片妆纹，穿橄榄绿色飞行夹克和米色针织衫",
    composition: "竖版近景肖像，人物微微歪头看向镜头，背景植物和玻璃结构虚化",
    style: "自然光清新肖像摄影，细腻皮肤、植物氛围、柔和浅景深",
    palette: "橄榄绿、米白、肤色、玻璃温室冷光",
    details: "叶片脸绘、黑发发丝、夹克罗纹、针织纹理、温室花盆",
    mood: "清新、安静、自然、少年"
  }),
  createMediaItem({
    slug: "makeup-analysis-guide",
    title: "妆造分析图",
    series: "妆造分析",
    file: "makeup-analysis-guide.png",
    summary: "自然清透妆容分析指南，包含面部标注和局部妆容拆解。",
    subject: "女性模特穿棕色高领针织上衣，面部裸妆清透，画面包含眼妆、唇妆、腮红、肤质和脸型分析标注",
    composition: "竖版信息图，上半部分为半身肖像与引线标注，下半部分为底妆、眼妆、腮红、唇妆局部块面和色彩搭配",
    style: "美妆分析指南、杂志式版式、极简高级商业视觉",
    palette: "棕色、裸色、米白、柔和肤色、自然阴影",
    details: "英文标题、中文说明、引线圆点、色盘、局部肌肤特写、产品粉质笔触",
    mood: "干净、专业、温柔、高级"
  }),
  createMediaItem({
    slug: "may-21-video",
    title: "5月21日 视频作品",
    series: "视频作品",
    file: "may-21-video.mp4",
    mediaType: "video",
    summary: "本地视频作品素材，点开可播放完整视频。",
    subject: "以原视频为准，保留主体、色彩、节奏和关键视觉元素",
    motion: "完整展示原视频中的镜头运动、转场节奏和主体变化，开头要清楚建立画面，结尾保留动作收束",
    style: "AIGC视频作品展示，强调动态质感、清晰画面和创意转场",
    palette: "遵循原视频色彩，保留高光、暗部和主体颜色关系",
    details: "主体动作、镜头节奏、环境细节、光影变化、材质与动态轨迹",
    mood: "完整、流畅、作品集展示感"
  }),
  createMediaItem({
    slug: "anime-girl-superpower-video",
    title: "动漫女孩超能力视频",
    series: "视频作品",
    file: "anime-girl-superpower.mp4",
    mediaType: "video",
    summary: "动漫女孩释放超能力的动态视频。",
    subject: "动漫女孩作为核心主体，释放能量或超能力效果，画面具有强烈的幻想动作感",
    motion: "镜头围绕角色动作推进，能量光效从蓄力到爆发，保留发丝、衣摆、粒子和冲击波细节",
    style: "动漫风AIGC视频，超能力战斗、发光粒子、动态镜头",
    palette: "高饱和能量色与暗部对比，根据原视频保留主色调",
    details: "角色表情、手势、能量轨迹、粒子爆发、背景运动模糊",
    mood: "热血、幻想、爆发、速度"
  }),
  createMediaItem({
    slug: "city-timelapse-video",
    title: "都市时间流逝视频",
    series: "视频作品",
    file: "city-timelapse.mp4",
    mediaType: "video",
    summary: "都市环境时间流逝效果视频。",
    subject: "城市建筑、街道或天光作为主体，展示时间快速流逝和光影变化",
    motion: "使用延时摄影式推进，云层、车流、灯光和人群随时间变化形成连续节奏",
    style: "城市延时、电影感、现代都市视觉",
    palette: "城市霓虹、天空冷暖变化、建筑暗部与灯光高光",
    details: "车流光轨、窗户灯光、云影移动、街道层次和时间转换",
    mood: "都市、流动、时间感、繁忙"
  }),
  createMediaItem({
    slug: "hippo-bath-video",
    title: "河马洗澡视频",
    series: "视频作品",
    file: "hippo-bath.mp4",
    mediaType: "video",
    summary: "河马洗澡主题的趣味短视频。",
    subject: "河马在水中或浴场洗澡，强调身体体量、水花和可爱的动作反应",
    motion: "镜头稳定展示河马动作，水面波动、水花飞溅和身体转动要自然连贯",
    style: "趣味动物短片，真实或拟真AIGC水体效果",
    palette: "水蓝、灰褐色皮肤、自然高光和柔和环境色",
    details: "水花、湿润皮肤、表情、环境边缘、波纹与泡沫",
    mood: "可爱、轻松、幽默、生活感"
  }),
  createMediaItem({
    slug: "sand-sculpt-object-video",
    title: "捏沙成物",
    series: "视频作品",
    file: "sand-sculpt-object.mp4",
    mediaType: "video",
    summary: "沙子被捏塑成物体的生成过程视频。",
    subject: "手部或外力将沙粒逐步塑造成明确物体，突出材质变化和成形过程",
    motion: "从松散沙粒到具体形体的连续变化，沙粒坍落、聚合、压实和边缘成型要清晰",
    style: "材料变形AIGC视频，微距质感、生成过程、实验短片",
    palette: "沙色、暖光、暗部阴影、细小颗粒高光",
    details: "沙粒颗粒、手部压力、形体轮廓、散落碎屑、镜头焦点变化",
    mood: "神奇、手作、治愈、材料实验"
  }),
  createMediaItem({
    slug: "witch-video",
    title: "女巫视频",
    series: "视频作品",
    file: "witch-video.mp4",
    mediaType: "video",
    summary: "女巫主题的奇幻视频。",
    subject: "女巫角色与魔法环境作为主体，包含神秘服饰、法术动作或暗色幻想场景",
    motion: "镜头围绕女巫动作缓慢推进，魔法光效、烟雾、衣摆和环境粒子自然流动",
    style: "暗黑奇幻AIGC视频，魔法仪式、电影感光影",
    palette: "深色背景、紫色或绿色魔法光、暖色烛光、冷雾",
    details: "帽子、长袍、法器、烟雾、符文、面部表情与魔法粒子",
    mood: "神秘、危险、仪式、幻想"
  }),
  createMediaItem({
    slug: "image-to-video",
    title: "图生视频",
    series: "视频作品",
    file: "image-to-video.mp4",
    mediaType: "video",
    summary: "图像生成视频的动态演示素材。",
    subject: "以原始图像内容为核心，将静态画面转化为有镜头运动和局部动态的视频",
    motion: "保留原图构图，加入轻微推拉、景深变化、主体局部动作和环境动态",
    style: "图生视频演示，强调从静态到动态的自然过渡",
    palette: "遵循原图色彩并保持色彩稳定",
    details: "主体轮廓、局部细节、背景层次、镜头缓动、无跳变无拉扯",
    mood: "平滑、完整、展示型、生成感"
  }),
  createMediaItem({
    slug: "cat-kneading-video",
    title: "小猫揉面视频",
    series: "视频作品",
    file: "cat-kneading.mp4",
    mediaType: "video",
    summary: "小猫揉面动作的治愈短视频。",
    subject: "小猫用前爪反复揉动柔软表面，突出毛发、爪子和温柔动作",
    motion: "镜头稳定或轻微推进，前爪一下一下揉动，毛发和垫子产生细微形变",
    style: "治愈宠物短片，柔和光线，真实毛发质感",
    palette: "暖色室内光、柔软布料色、猫咪毛色与浅景深背景",
    details: "爪垫、毛发、布料压痕、眼神、呼吸和轻微身体晃动",
    mood: "治愈、安静、可爱、放松"
  }),
  createMediaItem({
    slug: "eye-product-ad-video",
    title: "眼睛产品宣传视频",
    series: "视频作品",
    file: "eye-product-ad.mp4",
    mediaType: "video",
    summary: "眼睛相关产品的宣传视频素材。",
    subject: "眼部或眼睛产品作为核心视觉，展示产品质感、功效氛围和高端商业画面",
    motion: "使用广告式镜头推进，产品或眼部特写清晰，光效、液体、反射和文字节奏有高级感",
    style: "商业产品宣传片，高端美妆或科技感广告，精致微距",
    palette: "干净高光、深色背景或清透色调，以原视频主色为准",
    details: "眼部细节、产品包装、反射高光、液体质感、柔焦背景和收尾定格",
    mood: "高级、干净、精致、可信"
  })
]);

const app = document.querySelector("#app");
const body = document.body;
const modeButtons = Array.from(document.querySelectorAll(".mode-button"));
const menuButton = document.querySelector(".menu-button");
const menuClose = document.querySelector(".menu-close");
const menuBackdrop = document.querySelector(".menu-backdrop");
const menuFooter = document.querySelector(".menu-footer");
const menuMailButton = document.querySelector(".menu-mail");
const menuEmailText = document.querySelector(".menu-email-text");
const loader = document.querySelector(".loader");
const introSignature = document.querySelector(".intro-signature");
const soundButton = document.querySelector(".sound-button");
const blessingTrigger = document.querySelector(".blessing-trigger");
const dialog = document.querySelector(".blessing-dialog");
const dialogClose = dialog.querySelector(".dialog-close");

let mode = "spiral";
let cleanups = [];
let loaderHideTimer = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cleanupRoute() {
  cleanups.forEach((fn) => fn());
  cleanups = [];
}

function openMenu() {
  body.classList.add("menu-open");
  menuButton.setAttribute("aria-expanded", "true");
  document.querySelector(".menu-panel").setAttribute("aria-hidden", "false");
}

function setMenuEmailVisible(isVisible) {
  menuFooter.classList.toggle("is-mail-open", isVisible);
  menuMailButton.setAttribute("aria-expanded", String(isVisible));
  menuEmailText.setAttribute("aria-hidden", String(!isVisible));
}

function closeMenu() {
  body.classList.remove("menu-open");
  menuButton.setAttribute("aria-expanded", "false");
  document.querySelector(".menu-panel").setAttribute("aria-hidden", "true");
  setMenuEmailVisible(false);
}

function currentRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (path === "/about") return { name: "about" };
  if (path.startsWith("/projects/")) return { name: "project", slug: path.split("/")[2] };
  return { name: "works" };
}

function render() {
  cleanupRoute();
  closeMenu();
  const route = currentRoute();
  body.dataset.route = route.name;
  if (route.name !== "works") delete body.dataset.mode;
  app.innerHTML = "";

  if (route.name === "about") {
    renderAbout();
  } else if (route.name === "project") {
    renderProject(route.slug);
  } else {
    renderWorks();
  }

  window.scrollTo({ top: 0, behavior: "instant" });
  app.focus({ preventScroll: true });
  attachCardReveal();
}

function setMode(nextMode) {
  if (nextMode === mode) return;
  cleanupRoute();
  mode = nextMode;
  modeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === mode);
  });
  if (currentRoute().name === "works") renderWorks();
}

function renderWorks() {
  body.dataset.route = "works";
  body.dataset.mode = mode;
  app.innerHTML = `
    <section class="works-page works-page--${mode}" aria-label="Works">
      ${mode === "spiral" ? renderSpiral() : renderList()}
    </section>
  `;

  if (mode === "spiral") {
    const view = app.querySelector(".spiral-view");
    requestAnimationFrame(() => view.classList.add("is-ready"));
    attachSpiralMotion();
  } else {
    attachListPreview();
    attachListFilter();
    attachVideoPreviews();
  }
}

function attachSpiralMotion() {
  const container = app.querySelector(".spiral-webgl");
  const view = app.querySelector(".spiral-view");
  const fallback = app.querySelector(".spiral-fallback");
  if (!container || !view) return;

  let disposed = false;
  let controller = null;

  import("./mobius-spiral.js?v=20")
    .then(({ createMobiusSpiral }) => {
      if (disposed) return;
      controller = createMobiusSpiral(container, projects, {
        onNavigate: openProjectWithTransition,
        onHover: (project) => {
          view.dataset.hoverProject = project ? project.title : "";
        }
      });
      view.classList.add("is-ready");
    })
    .catch((error) => {
      console.error(error);
      fallback.hidden = true;
      view.classList.add("is-ready", "webgl-error");
    });

  cleanups.push(() => {
    disposed = true;
    controller?.destroy();
  });
}

function renderSpiral() {
  return `
    <div class="spiral-view">
      <div class="spiral-webgl" aria-label="S-shaped project spiral"></div>
      <div class="spiral-fallback" hidden aria-hidden="true"></div>
    </div>
  `;
}

function renderMediaCard(project) {
  const isVideo = project.mediaType === "video";
  const badge = isVideo
    ? `<span class="media-badge" aria-hidden="true">
         <svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"></path></svg>
         <em>VIDEO</em>
       </span>`
    : "";
  return `
    <a class="media-card media-card--${project.mediaType}" href="#/projects/${project.slug}" data-project-card data-slug="${project.slug}" data-media-type="${project.mediaType}">
      <span class="media-card-thumb"${isVideo ? ` data-video-src="${project.mediaSrc}"` : ""}>
        <img src="${project.thumb}" alt="${escapeHtml(project.title)} thumbnail" loading="lazy" decoding="async">
        ${badge}
      </span>
      <span class="media-card-copy">
        <span class="media-card-title">${escapeHtml(project.title)}</span>
        <span class="media-card-meta">${escapeHtml(project.series)} / ${project.year}</span>
      </span>
    </a>
  `;
}

function renderMediaSection(title, items) {
  return `
    <section class="media-section" aria-labelledby="${title.toLowerCase()}-section-title">
      <header class="media-section-header">
        <h2 id="${title.toLowerCase()}-section-title">${title}</h2>
        <span>${items.length}</span>
      </header>
      <div class="media-grid">
        ${items.map(renderMediaCard).join("")}
      </div>
    </section>
  `;
}

function renderList() {
  const imageProjects = projects.filter((project) => project.mediaType !== "video");
  const videoProjects = projects.filter((project) => project.mediaType === "video");

  return `
    <div class="list-view">
      <div class="media-index">
        <nav class="media-filter" aria-label="Filter media">
          <span class="filter-indicator" aria-hidden="true"></span>
          <button class="filter-tab is-active" type="button" data-filter="all">All <span>${projects.length}</span></button>
          <button class="filter-tab" type="button" data-filter="image">Image <span>${imageProjects.length}</span></button>
          <button class="filter-tab filter-tab--video" type="button" data-filter="video">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"></path></svg>
            Video <span>${videoProjects.length}</span>
          </button>
        </nav>
        <div class="media-grid media-grid--unified">
          ${projects.map(renderMediaCard).join("")}
        </div>
      </div>
    </div>
  `;
}

function attachListPreview() {
  const cards = Array.from(app.querySelectorAll("[data-project-card]"));

  cards.forEach((link) => {
    link.addEventListener("click", (event) => {
      const slug = link.dataset.slug;
      const project = projects.find((item) => item.slug === slug);
      if (!project) return;
      event.preventDefault();

      openProjectWithTransition(project, {
        event,
        rect: link.querySelector(".media-card-thumb")?.getBoundingClientRect()
      });
    });
  });
}

function renderAbout() {
  const words = [
    "我是",
    "刘灿旭，",
    "居住在",
    "北京。",
    "我长期参与",
    "AIGC",
    "数据评测、",
    "视频理解",
    "与",
    "文生视频",
    "质量分析，",
    "熟悉从",
    "规则制定、",
    "评分校准、",
    "争议仲裁",
    "到",
    "Badcase",
    "归因复盘",
    "的全链路流程。",
    "我关注",
    "模型输出",
    "在真实业务场景中的",
    "可用性、",
    "一致性",
    "和",
    "表达质量，",
    "也会把",
    "重复经验",
    "沉淀为",
    "自动化工作流，",
    "让评测更稳定，",
    "让创意生产",
    "更可靠。"
  ];
  const chipAfter = new Map([
    [1, projects[0].thumb],
    [6, projects[8].thumb],
    [10, projects[4].thumb],
    [18, projects[2].thumb],
    [25, projects[15].thumb],
    [32, projects[21].thumb]
  ]);
  const text = words
    .map((word, index) => {
      const chip = chipAfter.has(index)
        ? `<img class="about-chip" src="${chipAfter.get(index)}" alt="">`
        : "";
      return `<span class="about-word">${escapeHtml(word)}</span>${chip}`;
    })
    .join(" ");

  const carouselItems = projects
    .map(
      (project) => `
      <a class="about-thumb" href="#/projects/${project.slug}">
        <img src="${project.thumb}" alt="${escapeHtml(project.title)}" loading="lazy" decoding="async">
        <span><em>view project</em></span>
      </a>
    `
    )
    .join("");

  app.innerHTML = `
    <section class="about-page" aria-label="About">
      <div class="about-intro">
        <div class="about-sticky">
          <p class="about-text">${text}</p>
        </div>
      </div>
      <div class="about-carousel" aria-label="Project thumbnails">
        <div class="carousel-track">${carouselItems}</div>
        <div class="carousel-track" aria-hidden="true">${carouselItems}</div>
      </div>
      <section class="social-section" aria-label="Contact and expertise">
        <div class="social-stack">
          <a href="mailto:liucanxv@163.com">liucanxv@163.com</a>
          <span>AIGC Evaluation</span>
          <span>Prompt Workflow</span>
          <span>Video Caption QA</span>
        </div>
        <p class="credits">based in Beijing · AI data quality · visual generation workflow</p>
      </section>
    </section>
  `;

  attachAboutScroll();
}

function attachAboutScroll() {
  const section = app.querySelector(".about-intro");
  const words = Array.from(app.querySelectorAll(".about-word"));
  const chips = Array.from(app.querySelectorAll(".about-chip"));

  const update = () => {
    const rect = section.getBoundingClientRect();
    const max = section.offsetHeight - window.innerHeight;
    const progress = Math.min(1, Math.max(0, -rect.top / max));
    const active = progress * (words.length + 3);

    words.forEach((word, index) => {
      word.style.opacity = index <= active ? "1" : "0.36";
    });

    chips.forEach((chip) => {
      const visibleWords = Array.from(chip.parentElement.children);
      const chipIndex = visibleWords.indexOf(chip);
      chip.classList.toggle("is-visible", chipIndex <= active + 2);
    });
  };

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  cleanups.push(() => {
    window.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
  });
  update();
}

function renderProject(slug) {
  const project = projects.find((item) => item.slug === slug) || projects[0];
  const index = projects.indexOf(project);
  const prev = projects[(index - 1 + projects.length) % projects.length];
  const next = projects[(index + 1) % projects.length];
  body.dataset.route = "project";
  const mediaMarkup =
    project.mediaType === "video"
      ? `<video class="detail-media" controls autoplay muted loop playsinline preload="auto" poster="${project.thumb}" src="${project.mediaSrc}"></video>`
      : `<img class="detail-media is-progressive" src="${project.thumb}" data-full="${project.mediaSrc}" alt="${escapeHtml(project.title)}" decoding="async">`;

  app.innerHTML = `
    <article class="project-page">
      <section class="project-detail">
        <div class="project-media" aria-label="${escapeHtml(project.title)} media">
          <div class="project-media-inner">${mediaMarkup}</div>
        </div>
        <div class="project-info">
          <p class="project-kicker">${escapeHtml(project.series)} / ${project.year}</p>
          <h1 class="project-title">${escapeHtml(project.title)}</h1>
          <p class="project-description">${escapeHtml(project.description)}</p>
          <div class="prompt-panel">
            <div class="prompt-panel-header">
              <span>生成提示词</span>
              ${project.groupPhoto ? "<em>合照置顶</em>" : ""}
              <button class="prompt-copy" type="button" data-prompt-copy>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a1 1 0 0 1 1-1h10"></path></svg>
                <span>复制</span>
              </button>
            </div>
            <pre>${escapeHtml(project.prompt)}</pre>
          </div>
          <div class="project-actions">
            <a class="pill-link dark" href="#/">all works</a>
          </div>
        </div>
      </section>
      <nav class="project-nav" aria-label="Project navigation">
        <a href="#/projects/${prev.slug}">&larr; ${escapeHtml(prev.title)}</a>
        <a href="#/projects/${next.slug}">${escapeHtml(next.title)} &rarr;</a>
      </nav>
    </article>
  `;

  const video = app.querySelector("video.detail-media");
  if (video) video.play().catch(() => {});
  attachProgressiveMedia();
  attachMediaTilt();
  attachTitleDecode(project.title);
  attachPromptCopy(project.prompt);
  runPendingProjectTransition(project);
}

/* —— 标题解码动画:乱码字符逐位落定 —— */
function attachTitleDecode(finalText) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const node = app.querySelector(".project-title");
  if (!node) return;
  const glyphs = "▚▞▖▘░▒◆◇╳—╱╲";
  const chars = Array.from(finalText);
  const total = 26;
  let frame = 0;
  let raf = 0;

  const step = () => {
    frame += 1;
    const settled = Math.floor((frame / total) * chars.length);
    node.innerHTML = chars
      .map((char, index) => {
        if (index < settled || char === " ") return escapeHtml(char);
        return `<span class="decode-glyph">${glyphs[Math.floor(Math.random() * glyphs.length)]}</span>`;
      })
      .join("");
    if (settled < chars.length) {
      raf = requestAnimationFrame(step);
    } else {
      node.textContent = finalText;
    }
  };
  raf = requestAnimationFrame(step);
  cleanups.push(() => {
    cancelAnimationFrame(raf);
    if (node.isConnected) node.textContent = finalText;
  });
}

/* —— 提示词一键复制 —— */
function attachPromptCopy(promptText) {
  const button = app.querySelector("[data-prompt-copy]");
  if (!button) return;
  const label = button.querySelector("span");
  let timer = 0;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(promptText);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = promptText;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    button.classList.add("is-copied");
    label.textContent = "已复制 ✓";
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      button.classList.remove("is-copied");
      label.textContent = "复制";
    }, 1600);
  });
  cleanups.push(() => window.clearTimeout(timer));
}

/* —— 渐进式加载：先显示缩略图(已缓存)，大图就位后淡入 —— */
function attachProgressiveMedia() {
  const img = app.querySelector("img.detail-media.is-progressive");
  if (!img) return;
  const frame = img.closest(".project-media-inner");
  frame?.classList.add("is-loading");

  const full = new Image();
  full.decoding = "async";
  full.src = img.dataset.full;

  const reveal = () => {
    if (!img.isConnected) return;
    img.src = full.src;
    img.classList.remove("is-progressive");
    img.classList.add("is-loaded");
    frame?.classList.remove("is-loading");
  };
  if (full.decode) {
    full.decode().then(reveal).catch(() => { full.onload = reveal; });
  } else {
    full.onload = reveal;
  }
  cleanups.push(() => { full.onload = null; });
}

/* —— 作品大图 3D 视差倾斜 —— */
function attachMediaTilt() {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  const frame = app.querySelector(".project-media-inner");
  if (!frame) return;
  frame.classList.add("has-tilt");

  let raf = 0;
  const onMove = (event) => {
    const rect = frame.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      frame.style.setProperty("--tiltX", `${(-py * 5).toFixed(2)}deg`);
      frame.style.setProperty("--tiltY", `${(px * 7).toFixed(2)}deg`);
      frame.style.setProperty("--glareX", `${((px + 0.5) * 100).toFixed(1)}%`);
      frame.style.setProperty("--glareY", `${((py + 0.5) * 100).toFixed(1)}%`);
    });
  };
  const onLeave = () => {
    cancelAnimationFrame(raf);
    frame.style.setProperty("--tiltX", "0deg");
    frame.style.setProperty("--tiltY", "0deg");
  };
  frame.addEventListener("pointermove", onMove);
  frame.addEventListener("pointerleave", onLeave);
  cleanups.push(() => {
    cancelAnimationFrame(raf);
    frame.removeEventListener("pointermove", onMove);
    frame.removeEventListener("pointerleave", onLeave);
  });
}

/* —— 列表卡片进入视口时交错浮现 —— */
function attachCardReveal() {
  const cards = Array.from(app.querySelectorAll(".media-card"));
  if (!cards.length || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.style.transitionDelay = `${(Number(el.dataset.revealIndex) % 8) * 55}ms`;
        el.classList.add("is-revealed");
        io.unobserve(el);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -4% 0px" }
  );
  cards.forEach((card, index) => {
    card.dataset.revealIndex = index;
    card.classList.add("will-reveal");
    io.observe(card);
  });
  cleanups.push(() => io.disconnect());
}

/* —— 列表筛选:All / Image / Video,滑块指示器 —— */
function attachListFilter() {
  const nav = app.querySelector(".media-filter");
  if (!nav) return;
  const tabs = Array.from(nav.querySelectorAll(".filter-tab"));
  const indicator = nav.querySelector(".filter-indicator");
  const cards = Array.from(app.querySelectorAll(".media-card"));

  const moveIndicator = (tab) => {
    indicator.style.width = `${tab.offsetWidth}px`;
    indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
  };

  const applyFilter = (filter) => {
    cards.forEach((card, index) => {
      const match = filter === "all" || card.dataset.mediaType === filter;
      if (match) {
        card.classList.remove("is-filtered-out");
        card.style.transitionDelay = `${(index % 8) * 30}ms`;
        card.classList.remove("is-revealed");
        void card.offsetWidth;
        card.classList.add("is-revealed");
      } else {
        card.classList.add("is-filtered-out");
      }
    });
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((other) => other.classList.toggle("is-active", other === tab));
      moveIndicator(tab);
      applyFilter(tab.dataset.filter);
    });
  });

  const onResize = () => {
    const active = nav.querySelector(".filter-tab.is-active");
    if (active) moveIndicator(active);
  };
  window.addEventListener("resize", onResize);
  cleanups.push(() => window.removeEventListener("resize", onResize));

  requestAnimationFrame(() => moveIndicator(tabs[0]));
}

/* —— 视频卡片:悬停自动播放静音预览 —— */
function attachVideoPreviews() {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  const thumbs = Array.from(app.querySelectorAll(".media-card-thumb[data-video-src]"));

  thumbs.forEach((thumb) => {
    let video = null;
    let leaveTimer = 0;

    const enter = () => {
      window.clearTimeout(leaveTimer);
      if (!video) {
        video = document.createElement("video");
        video.className = "media-card-preview";
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.src = thumb.dataset.videoSrc;
        thumb.appendChild(video);
      }
      video.currentTime = 0;
      video.play().then(() => thumb.classList.add("is-previewing")).catch(() => {});
    };

    const leave = () => {
      thumb.classList.remove("is-previewing");
      leaveTimer = window.setTimeout(() => video?.pause(), 240);
    };

    thumb.closest(".media-card").addEventListener("pointerenter", enter);
    thumb.closest(".media-card").addEventListener("pointerleave", leave);
    cleanups.push(() => {
      window.clearTimeout(leaveTimer);
      video?.pause();
    });
  });
}

function enterSite(useSound) {
  body.classList.add("has-entered");
  body.classList.toggle("is-muted", !useSound);
  if (!loader) return;
  window.clearTimeout(loaderHideTimer);
  loaderHideTimer = window.setTimeout(() => {
    if (body.classList.contains("has-entered")) loader.hidden = true;
  }, 900);
}

function enterFromIntro() {
  if (body.classList.contains("has-entered")) return;
  enterSite(false);
}

function updateIntroPointer(event) {
  if (!introSignature) return;
  const rect = introSignature.getBoundingClientRect();
  introSignature.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  introSignature.style.setProperty("--my", `${event.clientY - rect.top}px`);
  introSignature.classList.add("is-hovered");
}

function resetIntroPointer() {
  if (!introSignature) return;
  introSignature.classList.remove("is-hovered");
}

/* ============================================================
   祝福 · 抽签引擎
   ============================================================ */
const BLESSINGS = [
  { theme: "光", text: "愿你一路有光，心有热爱，眼有星河；每一次出发，都遇见更辽阔的自己。" },
  { theme: "行", text: "愿你走过的每一段路都不白走，看过的每一片云都落进心里，成为日后的底气。" },
  { theme: "春", text: "愿你历遍山河，仍觉人间值得；霜雪过后，依旧有一整个春天为你而来。" },
  { theme: "静", text: "愿你在喧嚣里守住一隅安静，慢慢走，稳稳爱，不慌不忙地长成自己。" },
  { theme: "野", text: "愿你眼里有篝火，胸中有旷野，永远对世界保持第一次抵达时的惊奇。" },
  { theme: "海", text: "愿所有失去都以另一种方式归来，愿你心里的潮水，永远向着明亮那方。" },
  { theme: "燃", text: "愿你的热爱永不熄灭，做的每一件小事，都在悄悄把你带向想去的地方。" },
  { theme: "月", text: "愿你在深夜里也有月光可枕，孤独时仍能听见自己心里的回响。" },
  { theme: "风", text: "愿你乘的是长风，赴的是山海；所有的不期而遇，都在路上等你。" },
  { theme: "晴", text: "愿你被生活温柔相待，偶有阴天，也总能在云层背后找到那束留给你的晴。" }
];

let lastBlessingIndex = -1;
let motesEngine = null;
let blessingCharTimers = [];

function pickBlessing() {
  let index;
  do {
    index = Math.floor(Math.random() * BLESSINGS.length);
  } while (index === lastBlessingIndex && BLESSINGS.length > 1);
  lastBlessingIndex = index;
  return BLESSINGS[index];
}

function showBlessing() {
  const blessing = pickBlessing();
  const textNode = dialog.querySelector(".blessing-text");
  const themeNode = dialog.querySelector(".blessing-theme b");
  const watermark = dialog.querySelector(".blessing-watermark");
  const seal = dialog.querySelector(".blessing-seal");
  const panel = dialog.querySelector(".blessing-panel");

  blessingCharTimers.forEach(clearTimeout);
  blessingCharTimers = [];

  themeNode.textContent = blessing.theme;
  watermark.textContent = blessing.theme;
  panel.classList.remove("is-sealed");
  seal.classList.remove("is-stamped");

  /* 逐字浮现 */
  textNode.innerHTML = "";
  const chars = Array.from(blessing.text);
  chars.forEach((char, index) => {
    const span = document.createElement("span");
    span.className = "blessing-char";
    span.textContent = char;
    span.style.animationDelay = `${0.32 + index * 0.034}s`;
    textNode.appendChild(span);
  });

  /* 文字落定后,印章盖下 */
  const sealDelay = 600 + chars.length * 34;
  blessingCharTimers.push(
    window.setTimeout(() => {
      seal.classList.add("is-stamped");
      panel.classList.add("is-sealed");
    }, sealDelay)
  );
}

/* —— 漂浮光尘粒子 —— */
function startMotes() {
  const canvas = dialog.querySelector(".blessing-motes");
  if (!canvas || motesEngine) return;
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let raf = 0;
  let particles = [];

  const resize = () => {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
  };

  const spawn = () => {
    const count = window.matchMedia("(max-width: 720px)").matches ? 22 : 38;
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: (Math.random() * 1.6 + 0.5) * dpr,
      vx: (Math.random() - 0.5) * 0.12 * dpr,
      vy: -(Math.random() * 0.22 + 0.06) * dpr,
      tw: Math.random() * Math.PI * 2,
      tws: Math.random() * 0.018 + 0.006,
      green: Math.random() < 0.4
    }));
  };

  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.tw += p.tws;
      if (p.y < -8) { p.y = canvas.height + 8; p.x = Math.random() * canvas.width; }
      if (p.x < -8) p.x = canvas.width + 8;
      if (p.x > canvas.width + 8) p.x = -8;
      const alpha = 0.16 + Math.abs(Math.sin(p.tw)) * 0.5;
      ctx.beginPath();
      ctx.fillStyle = p.green
        ? `rgba(33, 255, 192, ${alpha * 0.8})`
        : `rgba(250, 250, 250, ${alpha * 0.55})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    raf = requestAnimationFrame(tick);
  };

  resize();
  spawn();
  tick();
  window.addEventListener("resize", resize);
  motesEngine = {
    stop() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      motesEngine = null;
    }
  };
}

function openBlessing() {
  document.documentElement.classList.add("dialog-open");
  dialog.showModal();
  showBlessing();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) startMotes();
}

function closeBlessing() {
  dialog.classList.add("is-closing");
  window.setTimeout(() => {
    dialog.classList.remove("is-closing");
    dialog.close();
    document.documentElement.classList.remove("dialog-open");
    motesEngine?.stop();
    blessingCharTimers.forEach(clearTimeout);
  }, 260);
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

menuButton.addEventListener("click", openMenu);
menuClose.addEventListener("click", closeMenu);
menuBackdrop.addEventListener("click", closeMenu);
menuMailButton.addEventListener("click", () => {
  setMenuEmailVisible(!menuFooter.classList.contains("is-mail-open"));
});
document.querySelectorAll(".menu-panel a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});

if (loader) {
  loader.addEventListener("click", enterFromIntro);
  loader.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    enterFromIntro();
  });
}

if (introSignature) {
  introSignature.addEventListener("pointermove", updateIntroPointer);
  introSignature.addEventListener("pointerleave", resetIntroPointer);
}

soundButton.addEventListener("click", () => body.classList.toggle("is-muted"));
blessingTrigger.addEventListener("click", openBlessing);
dialog.querySelector(".blessing-again")?.addEventListener("click", showBlessing);
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (!dialog.classList.contains("is-closing")) closeBlessing();
});
dialogClose.addEventListener("click", closeBlessing);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeBlessing();
});

window.addEventListener("hashchange", render);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    if (dialog.open) closeBlessing();
  }
});

if (new URLSearchParams(window.location.search).has("skipIntro")) {
  body.classList.add("has-entered", "is-muted");
  if (loader) loader.hidden = true;
}

/* —— 自定义光标：小圆点 + 拖尾光环，悬停可交互元素时放大 —— */
(function initCustomCursor() {
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const dot = document.createElement("div");
  const ring = document.createElement("div");
  dot.className = "cursor-dot";
  ring.className = "cursor-ring";
  document.body.append(ring, dot);
  document.documentElement.classList.add("has-custom-cursor");

  let mx = innerWidth / 2, my = innerHeight / 2;
  let rx = mx, ry = my;

  window.addEventListener("pointermove", (e) => {
    mx = e.clientX; my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px)`;
    const t = e.target;
    const interactive = t.closest?.("a, button, [data-project-card], .mode-button, input, textarea, video");
    ring.classList.toggle("is-active", Boolean(interactive));
  }, { passive: true });

  window.addEventListener("pointerdown", () => ring.classList.add("is-pressed"));
  window.addEventListener("pointerup", () => ring.classList.remove("is-pressed"));
  document.addEventListener("mouseleave", () => { dot.style.opacity = "0"; ring.style.opacity = "0"; });
  document.addEventListener("mouseenter", () => { dot.style.opacity = "1"; ring.style.opacity = "1"; });

  (function trail() {
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    ring.style.transform = `translate(${rx}px, ${ry}px)`;
    requestAnimationFrame(trail);
  })();
})();

/* —— 背景视差:极光与网格随指针轻微漂移 —— */
(function initFieldParallax() {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const field = document.querySelector(".field");
  if (!field) return;
  let tx = 0, ty = 0, cx = 0, cy = 0;
  window.addEventListener("pointermove", (e) => {
    tx = (e.clientX / window.innerWidth - 0.5) * -14;
    ty = (e.clientY / window.innerHeight - 0.5) * -10;
  }, { passive: true });
  (function loop() {
    cx += (tx - cx) * 0.045;
    cy += (ty - cy) * 0.045;
    field.style.setProperty("--parX", cx.toFixed(2));
    field.style.setProperty("--parY", cy.toFixed(2));
    requestAnimationFrame(loop);
  })();
})();

/* —— 磁吸按钮：指针靠近时轻微吸附 —— */
(function initMagneticButtons() {
  if (!window.matchMedia("(pointer: fine)").matches) return;
  const targets = document.querySelectorAll(".mode-button, .menu-button, .sound-button, .blessing-trigger");
  targets.forEach((el) => {
    el.classList.add("is-magnetic");
    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      el.style.setProperty("--magX", `${(x * 0.28).toFixed(1)}px`);
      el.style.setProperty("--magY", `${(y * 0.28).toFixed(1)}px`);
    });
    el.addEventListener("pointerleave", () => {
      el.style.setProperty("--magX", "0px");
      el.style.setProperty("--magY", "0px");
    });
  });
})();

render();
