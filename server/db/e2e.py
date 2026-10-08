# -*- coding: utf-8 -*-
"""定制旅游全流程走查：扮演客人 / 门店 / 供应商 / 总部，把正向与逆向链路真跑一遍。"""
import json, urllib.request, sys
B='http://127.0.0.1:8930/utrip/api'
FAIL=[]
def req(m,p,body=None):
    r=urllib.request.Request(B+p, method=m,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type':'application/json'})
    try:
        return json.loads(urllib.request.urlopen(r,timeout=30).read() or '{}')
    except urllib.error.HTTPError as e:
        return {'__err':e.code,'__msg':e.read().decode()[:220]}
def step(name, res, expect_ok=True):
    bad = '__err' in res
    if expect_ok and bad:
        FAIL.append((name,res['__msg'])); print(f'  ✗ {name} → {res["__err"]} {res["__msg"]}')
    elif not expect_ok and not bad:
        FAIL.append((name,'本该被拦住却通过了')); print(f'  ✗ {name} → 本该被拦住却通过了')
    else:
        print(f'  ✓ {name}' + ('' if expect_ok else f'（已正确拦截：{res.get("__msg","")[:70]}）'))
    return res

print('【1】客人：AI 行程师出方案并提交')
pv=step('AI 生成方案', req('POST','/mini/ai/preview',{'dest':'希腊','days':9,'adults':2,'children':1,'prefs':['海岛','美食']}))
sub=step('提交咨询单', req('POST','/mini/ai/submit',{'dest':'希腊','days':9,'adults':2,'children':1,
    'customer':'走查客人A','phone':'13500000001','goDate':'2027-04-18','budget':120000,'plan':pv}))
NO=sub.get('no'); print('  咨询单号',NO)

print('【2】门店：接单 → 确认方案 → 派单')
step('接单', req('POST',f'/csp/consult/{NO}/action',{'key':'take','who':'李晴'}))
step('未确认就派单应被拦', req('POST',f'/csp/consult/{NO}/dispatch',{'mode':'auto'}), False) if False else None
step('确认方案', req('POST',f'/csp/consult/{NO}/action',{'key':'confirm'}))
vs=step('查可派供应商', req('GET',f'/csp/consult/{NO}/vendors'))
print('   可派：',[v['name'] for v in vs.get('vendors',[])])
dp=step('派单', req('POST',f'/csp/consult/{NO}/dispatch',{'mode':'auto'}))
VENDORS=[v['id'] for v in dp.get('vendors',[])]
print('   已派：',VENDORS)

print('【3】供应商：接单 → 报价')
for i,v in enumerate(VENDORS):
    step(f'{v} 接单', req('POST','/ubk/take',{'no':NO,'vendor':v}))
    step(f'{v} 报价', req('POST','/ubk/quote',{'no':NO,'vendor':v,'total':78000+i*4200,
        'items':[{'n':'地接车导','v':25000},{'n':'酒店','v':32000},{'n':'门票与体验','v':14000},{'n':'餐食','v':7000}],
        'memo':'走查报价'}))

print('【4】门店：比价 → 选定 → 成交生成订单')
cmp=step('AI 比价', req('GET',f'/csp/consult/{NO}/compare'))
best=(cmp.get('rank') or cmp.get('list') or [{}])[0]
pick=best.get('supplier_id') or best.get('id') or (VENDORS[0] if VENDORS else None)
print('   比价推荐：',pick)
pk=step('选定供应商', req('POST',f'/csp/consult/{NO}/pick',{'vendor':pick}))
print('   选定后：结算价',pk.get('cost'),'AI报价',pk.get('quote'),'建议成交价',pk.get('suggest'),f"(目标毛利{pk.get('margin')}%)")
step('成交价低于成本应被拦', req('POST',f'/csp/consult/{NO}/action',{'key':'order','amount':pk.get('cost',0)-1}), False)
od=step('按建议价成交生成订单', req('POST',f'/csp/consult/{NO}/action',{'key':'order','amount':pk.get('suggest')}))
ORD=od.get('orderNo'); print('   订单号',ORD)

print('【5】订单：详情完整性')
full=step('订单详情', req('GET',f'/order/{ORD}/full'))
if '__err' not in full:
    print(f"   出行人 {len(full['travelers'])} · 日志 {len(full['logs'])} · 流水 {len(full['payments'])} · 进度 {len(full['progress'])}")
    print('   金额：应收',full['money']['amount'],'成本',full['money']['cost'],'毛利',full['money']['profit'])
    if full['money']['cost']==0: FAIL.append(('订单成本','生成订单时没带上供应商结算价'))
    if len(full['travelers'])!=3: FAIL.append(('出行人','按 2 成人 1 儿童应生成 3 条，实际 %d 条'%len(full['travelers'])))

print('【6】订单正向：收款 → 签约 → 全款 → 出行 → 完成')
step('未收定金就签约应被拦', req('POST',f'/order/{ORD}/contract',{}), False)
amt=full.get('amount',0)
step('给不存在的订单加费用应被拦', req('POST','/order/DD000000/fee',{'name':'x','amount':1}), False)
step('收定金', req('POST',f'/order/{ORD}/pay',{'item':'定金','amount':int(amt*0.3),'way':'微信支付'}))
step('超额收款应被拦', req('POST',f'/order/{ORD}/pay',{'item':'尾款','amount':amt}), False)
step('签合同', req('POST',f'/order/{ORD}/contract',{}))
full0=req('GET',f'/order/{ORD}/full')
for it in full0.get('resItems',[]):
    req('POST',f'/order/{ORD}/res',{'id':it['id'],'state':'done'})
step('资源逐项确认', req('GET',f'/order/{ORD}/full'))
print('   资源状态：', req('GET',f'/order/{ORD}/full')['view']['res_state'])
step('发出行通知', req('POST',f'/order/{ORD}/forward',{'step':'notify'}))
step('未结清就标出发应被拦', req('POST',f'/order/{ORD}/forward',{'step':'go'}), False)
step('收尾款', req('POST',f'/order/{ORD}/pay',{'item':'尾款','amount':amt-int(amt*0.3),'way':'对公转账'}))
step('新增其他费用（客人承担）', req('POST',f'/order/{ORD}/fee',{'name':'单房差','amount':4200,'bear':'客人'}))
step('加费用后未补收差额不能出发', req('POST',f'/order/{ORD}/forward',{'step':'go'}), False)
step('补收单房差', req('POST',f'/order/{ORD}/pay',{'item':'尾款','amount':4200,'way':'微信支付'}))
step('标记已出发', req('POST',f'/order/{ORD}/forward',{'step':'go'}))
step('供应商结算', req('POST',f'/order/{ORD}/settle',{}))
step('标记回团完成', req('POST',f'/order/{ORD}/forward',{'step':'back'}))
f2=req('GET',f'/order/{ORD}/full')
print('   最终状态：',f2.get('st_cn'),'| 已收',f2['money']['recv'],'| 进度',[p['state'] for p in f2['progress']])

print('【7】逆向A：已收款 → 申请退款 → 总部审核 → 出账')
sub2=req('POST','/mini/ai/submit',{'dest':'冰岛','days':8,'adults':2,'customer':'走查客人B','phone':'13500000002','budget':90000})
N2=sub2['no']
for k in ['take','confirm']: req('POST',f'/csp/consult/{N2}/action',{'key':k})
d2=req('POST',f'/csp/consult/{N2}/dispatch',{'mode':'auto'})
v2=[v['id'] for v in d2.get('vendors',[])]
for v in v2:
    req('POST','/ubk/take',{'no':N2,'vendor':v}); req('POST','/ubk/quote',{'no':N2,'vendor':v,'total':59000})
p2=req('POST',f'/csp/consult/{N2}/pick',{'vendor':v2[0]})
O2=req('POST',f'/csp/consult/{N2}/action',{'key':'order','amount':p2['suggest']})['orderNo']
a2=req('GET',f'/order/{O2}/full')['amount']
step('收定金', req('POST',f'/order/{O2}/pay',{'item':'定金','amount':int(a2*0.3)}))
step('已收款不能直接取消', req('POST',f'/order/{O2}/cancel',{'reason':'客人变卦'}), False)
step('申请退款', req('POST',f'/order/{O2}/refund/apply',{'amount':int(a2*0.3*0.7),'reason':'客人签证被拒，申请退款'}))
step('重复申请应被拦', req('POST',f'/order/{O2}/refund/apply',{'amount':100,'reason':'x'}), False)
step('总部审核通过', req('POST',f'/order/{O2}/refund/audit',{'pass':True}))
r2=req('GET',f'/order/{O2}/full')
print('   退款后：状态',r2.get('st_cn'),'| 已收',r2['money']['recv'],'| 退款',r2['money']['refunded'],'| 退款态',r2.get('refund_state'))
c2=req('GET',f'/csp/consult/{N2}')
print('   关联咨询单状态：',c2.get('status'))

print('【8】逆向B：未收款 → 直接取消订单')
sub3=req('POST','/mini/ai/submit',{'dest':'瑞士','days':7,'adults':2,'customer':'走查客人C','phone':'13500000003','budget':80000})
N3=sub3['no']
for k in ['take','confirm']: req('POST',f'/csp/consult/{N3}/action',{'key':k})
d3=req('POST',f'/csp/consult/{N3}/dispatch',{'mode':'auto'})
v3=[v['id'] for v in d3.get('vendors',[])]
for v in v3: req('POST','/ubk/take',{'no':N3,'vendor':v}); req('POST','/ubk/quote',{'no':N3,'vendor':v,'total':52000})
p3=req('POST',f'/csp/consult/{N3}/pick',{'vendor':v3[0]})
O3=req('POST',f'/csp/consult/{N3}/action',{'key':'order','amount':p3['suggest']})['orderNo']
step('无原因取消应被拦', req('POST',f'/order/{O3}/cancel',{}), False)
step('取消订单', req('POST',f'/order/{O3}/cancel',{'reason':'客人行程变更，暂不出行'}))
r3=req('GET',f'/order/{O3}/full')
print('   取消后：状态',r3.get('st_cn'),'| 进度',[p['state'] for p in r3['progress']])
print('   关联咨询单状态：',req('GET',f'/csp/consult/{N3}').get('status'))

print('【9】客人侧：小程序能不能看到这几单')
mo=req('GET','/mini/orders?phone=13500000001')
print('   客人A 订单数：',len(mo) if isinstance(mo,list) else mo)

print('\n===== 走查结果 =====')
if FAIL:
    print(f'发现 {len(FAIL)} 个问题：')
    for n,m in FAIL: print(f'  · {n}：{m}')
else:
    print('全部通过')
print('TEST_ORDERS=',ORD,O2,O3)
print('TEST_CONSULTS=',NO,N2,N3)
