import re

def analyze():
    with open('/tmp/checkout.js', 'r', encoding='utf-8') as f:
        js = f.read()

    texts = re.findall(r'`([^`]{4,120})`', js)
    print("Found texts in checkout.js:")
    seen = set()
    for t in texts:
        t_clean = t.strip()
        if t_clean not in seen and any(k in t_clean.lower() for k in [
            'pix', 'pedido', 'nome', 'cpf', 'cep', 'rua', 'entrega', 'frete',
            'endereço', 'cartão', 'bairro', 'cidade', 'whatsapp', 'finalizar',
            'pagar', 'resumo', 'total', 'desconto', 'dados', 'número', 'estado'
        ]):
            seen.add(t_clean)
            print(" -", t_clean)

if __name__ == '__main__':
    analyze()
