// Shared by the emulator and the credits page, independently of machine startup.
const dialog = document.createElement("dialog");
dialog.id = "author-contact";
dialog.className = "author-contact-dialog";
dialog.setAttribute("aria-labelledby", "author-contact-title");
dialog.innerHTML = `
  <form method="dialog" class="author-contact-heading">
    <span>COMUNIDADE SINCLAIR QL</span>
    <button type="submit" autofocus>Fechar</button>
  </form>
  <h2 id="author-contact-title">Contactar o Autor</h2>
  <p>Este projeto nasce da admiração pelo Sinclair QL e pela comunidade que mantém
    viva a sua história. Na sua preparação, procurou-se cumprir todos os requisitos
    legais e éticos aplicáveis, respeitando os direitos, as licenças e o trabalho
    dos autores e das entidades envolvidas.</p>
  <p>Se alguma pessoa ou empresa considerar que um componente ou conteúdo incluído
    viola os seus direitos, ou preferir que um elemento da sua autoria ou de que
    seja titular não faça parte do emulador, agradeço que me contacte, identificando
    o elemento e o motivo do pedido. Cada situação será apreciada com atenção,
    respeito e boa-fé; após essa apreciação, os elementos a que o pedido se refere
    serão removidos do projeto.</p>
  <div class="author-contact-address">
    <strong>Luís Simões da Cunha</strong>
    <span class="author-contact-email">luis.luiscunha[at]gmail.com</span>
    <small>Para escrever, substitua <code>[at]</code> por <code>@</code>.</small>
  </div>
  <p class="author-contact-thanks">Obrigado por ajudar a preservar esta memória
    com respeito por quem a tornou possível.</p>
`;
document.body.append(dialog);

for (const link of document.querySelectorAll("[data-author-contact]")) {
  link.setAttribute("aria-haspopup", "dialog");
  link.setAttribute("aria-controls", dialog.id);
  link.addEventListener("click", (event) => {
    // Keep normal browser navigation available for modified clicks.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.showModal();
  });
}
