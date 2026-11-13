// Chinese next to the English in the supplier's Google Sheet (Erwin, 3 Nov 2026: "they are Chinese and have translation
// issues sometimes"). Every text the supplier reads says it in English and, on the next line, in Chinese (中文).
// The website only ever reads the English line of a header (en), so the Chinese line never changes what it reads.

// Column headers (supplier tabs, Billing, Product Quotes).
export const ZH = {
  'Date': '日期', 'Order': '订单号', 'Shop': '店铺', 'Status': '状态', 'Photo preview': '图片预览', 'Photo 1': '图片 1',
  'Product link': '商品链接', 'Qty': '数量', 'Product / variation': '商品 / 款式', 'Customer': '收件人',
  'Delivery address & phone': '收货地址和电话', 'Tax number': '税号', 'Gift message': '礼品留言', 'Notes': '备注',
  'Competitor price': '客户售价', 'Total cost (USD)': '总成本（美元）', 'Cost per product (USD)': '每件商品成本（美元）',
  'Tracking number': '运单号', 'Courier': '快递公司', 'Shipping status': '发货状态', 'Delayed?': '是否延迟？', 'Delay reason': '延迟原因',
  'Client paid': '客户付款', 'Photo 2': '图片 2', 'Photo 3': '图片 3', 'Photo 4': '图片 4', 'Photo 5': '图片 5', 'Photo 6': '图片 6',
  'Photo 7': '图片 7', 'Photo 8': '图片 8', 'More product links': '更多商品链接', 'Order ID': '订单 ID', 'Client ID': '客户 ID',
  'Domestic Express Tracking Number': '国内快递单号', 'Cancellation fee (USD)': '取消费（美元）', 'Status changed': '状态更新时间',
  'Paid for it (USD)': '已付金额（美元）', 'Refund (USD)': '退款（美元）',
  'Cancelled on': '取消日期', 'Cancelled': '已取消', 'Paid orders': '已付款订单', 'Paid for them (USD)': '已付金额（美元）',
  'Fees on paid (USD)': '已付订单的取消费（美元）', 'Not paid': '未付款', 'Fees not paid (USD)': '未付款订单的取消费（美元）',
  'Cancellation fees, all orders (USD)': '取消费，所有订单（美元）',
  'Client': '客户', 'Orders (USD)': '订单（美元）', 'Cancellation fees (USD)': '取消费（美元）', 'Paid by the client (USD)': '客户已付（美元）',
  'Client still owes (USD)': '客户还需付（美元）', 'Client credit (USD)': '客户余额（美元）', 'Order ID (website)': '订单 ID（网站）', 'Paid for it (website)': '已付金额（网站）',
  'Requested': '询价日期', 'Request': '编号', 'Product name': '商品名称', 'Variation / notes': '款式 / 备注', 'Expected per month': '预计每月数量',
  'Price per item (USD)': '单价（美元）', 'Shipping per order (USD)': '每单运费（美元）', 'Available?': '有货吗？', 'Supplier note': '供应商备注',
  'Product ID': '商品 ID',
};
// "Total cost (USD)" -> "Total cost (USD)\n总成本（美元）"; a header without a translation stays as it is.
export const bi = h => (ZH[h] ? `${h}\n${ZH[h]}` : h);
// The English line of a cell (what the website compares).
export const en = v => String(v ?? '').split('\n')[0].trim();

// The Guide tab: how the sheet works, one topic per row, English | 中文.
export const GUIDE_TAB = 'Guide 使用说明';
export const GUIDE = [
  ['Your columns\n你要填写的列',
    'Fill in only the YELLOW columns: Total cost, Cost per product, Tracking number, Courier, Shipping status, Delayed?, Delay reason, Domestic Express Tracking Number and Cancellation fee. Everything else is filled in by the Direct Line website. The website reads your changes within about a minute.',
    '只需要填写黄色的列：总成本、每件商品成本、运单号、快递公司、发货状态、是否延迟、延迟原因、国内快递单号和取消费。其他列由 Direct Line 网站自动填写。网站大约一分钟内会读取你的修改。'],
  ['Tabs\n标签页',
    'Orders: new orders and orders in progress, newest on top. Shipped: shipped orders with a tracking number (they move there by themselves). Cancelled: cancelled orders. You can edit your yellow columns in all three. Billing: every order for billing (paid / not paid) and the refund for cancelled orders. Product Quotes: price checks for new products.',
    'Orders：新订单和处理中的订单，最新的在最上面。Shipped：已发货并有运单号的订单（会自动移过去）。Cancelled：已取消的订单。三个标签页都可以修改你的黄色列。Billing：所有订单的账单（已付款 / 未付款）和取消订单的退款。Product Quotes：新商品询价。'],
  ['Total cost (column P)\n总成本（P 列）',
    'The cost of the whole order in US dollars, product + shipping. Numbers only, e.g. 17.90.',
    '整单成本（美元），包括商品和运费。只填数字，例如 17.90。'],
  ['Cost per product (column Q)\n每件商品成本（Q 列）',
    'Only for orders with several products (Product 1, Product 2… in Product / variation). Type the cost of each product in the same order, separated by commas, e.g. 10.90, 9.00, 11.00. Together they should add up to the Total cost.',
    '只用于有多个商品的订单（商品 / 款式列里有 Product 1、Product 2…）。按同样的顺序填写每个商品的成本，用逗号隔开，例如 10.90, 9.00, 11.00。加起来应等于总成本。'],
  ['Tracking and courier (columns R, S)\n运单号和快递（R、S 列）',
    'Column R: the tracking number. Column S: the courier (pick one from the list or type another).',
    'R 列：运单号。S 列：快递公司（从列表里选择，或者自己输入）。'],
  ['Shipping status (column T)\n发货状态（T 列）',
    'Pick Shipped when the parcel leaves. With a tracking number, the order then moves to the Shipped tab by itself. Cancelled, Cancel requested and Refunded are written by the website.',
    '包裹发出后选择 Shipped（已发货）。有运单号的订单会自动移到 Shipped 标签页。Cancelled（已取消）、Cancel requested（客户申请取消）和 Refunded（已退款）由网站自动填写。'],
  ['Delays (columns U, V)\n延迟（U、V 列）',
    'If an order will be late (e.g. wrong variant, being remade), pick Possibly delayed in column U and write a short reason in column V. Our client sees both. Pick On time again when it is moving.',
    '如果订单会晚发（例如款式错误、需要重做），在 U 列选择 Possibly delayed（可能延迟），并在 V 列写简短原因。客户能看到。恢复正常后改回 On time（准时）。'],
  ['Cost revision (ORANGE)\n降价请求（橙色）',
    'Our client sells this product at the price in column O (Competitor price) and asks for a lower cost. Answer in column P (Total cost):\n• You can lower it: type the new Total cost, e.g. 17.90. A lower cost is billed to our client right away.\n• You can\'t lower it: type NO and the reason, e.g. NO: factory price went up. The website puts the old cost back by itself and sends your reason to our client.\nRow 4 at the top shows how many requests are waiting.',
    '我们的客户以 O 列（客户售价）的价格销售这个商品，希望降低成本。请在 P 列（总成本）回复：\n• 可以降价：填写新的总成本，例如 17.90。更低的成本会马上计入客户账单。\n• 不能降价：填写 NO 和原因，例如 NO: 工厂涨价了（也可以写：不能降价：原因）。网站会自动把原来的成本填回去，并把你的原因发给客户。\n最上面第 4 行显示有多少个请求在等待。'],
  ['Colours in column O\nO 列的颜色',
    'ORANGE = waiting for your answer. PURPLE = you sent a new cost, Direct Line is checking it. NO COLOUR = the cost revision is done (the note ✓ REVISION DONE stays in the cell). Blue = the price our client sells at (no request).',
    '橙色 = 等你回复。紫色 = 你已报新价，Direct Line 正在确认。没有颜色 = 降价请求已完成（单元格里保留 ✓ REVISION DONE 的说明）。蓝色 = 客户的售价（没有降价请求）。'],
  ['Row colours\n行的颜色',
    'RED row, crossed out = cancelled order: do not buy or ship it. Light ORANGE row = a cost revision request, or our client asked to cancel (Shipping status Cancel requested): wait for Direct Line before buying or shipping. RED bold row = the same order number or tracking number is on two rows: please check it. PURPLE row = your new cost is being checked.',
    '红色删除线行 = 已取消的订单：不要购买或发货。浅橙色行 = 降价请求，或客户申请取消（发货状态是 Cancel requested）：购买或发货前请等 Direct Line 通知。红色加粗行 = 订单号或运单号在两行重复：请检查。紫色行 = 你的新报价正在确认中。'],
  ['Cancellation fee (column AI)\n取消费（AI 列）',
    'For a cancelled or cancel-requested order: type the fee if you charge one, e.g. 4. Leave it empty if there is no fee. Direct Line checks it before our client is charged.',
    '已取消或申请取消的订单：如果收取费用，请填写金额，例如 4。没有费用就留空。Direct Line 会先确认，再向客户收费。'],
  ['Domestic tracking (column AH)\n国内快递单号（AH 列）',
    'The tracking number of the domestic express in China, if there is one.',
    '中国国内快递的单号（如果有）。'],
  ['Client paid and row 4\n客户付款和第 4 行',
    'Column W (Client paid): Paid = our client has paid Direct Line for this order. Not paid = billed, not paid yet. Empty = no bill yet. Row 4 adds up your Total cost: all, paid and not paid.',
    'W 列（客户付款）：Paid = 客户已经付款给 Direct Line。Not paid = 已出账单但还没付款。空白 = 还没有账单。第 4 行汇总你的总成本：全部、已付款、未付款。'],
  ['Product Quotes tab\n询价标签页',
    'Type Price per item (USD, product only) and Shipping per order (USD, one parcel), or set Available? to Not available and add a note. Several prices (sizes, colours)? One per line, e.g. Small: 3.20 (new line) Large: 4.50.',
    '填写单价（美元，只含商品）和每单运费（美元，一个包裹），或者在“有货吗？”选择 Not available（没货）并写备注。有多个价格（尺寸、颜色）？每行一个，例如 Small: 3.20（换行）Large: 4.50。'],
  ['Sorting and filters\n排序和筛选',
    'To sort or filter, only use the filter buttons in the header row: they move whole rows. Don\'t select part of the table and sort it, that mixes up the orders.',
    '排序或筛选时，只使用标题行的筛选按钮，这样整行会一起移动。不要只选中表格的一部分来排序，否则订单会错乱。'],
  ['Questions\n有问题',
    'Not sure about something? Ask us in the WhatsApp group.',
    '有不清楚的地方，请在 WhatsApp 群里问我们。'],
];
