// Shared by the emulator and the credits page, independently of machine startup.
const dialog = document.createElement("dialog");
dialog.id = "author-contact";
dialog.className = "author-contact-dialog";
dialog.setAttribute("aria-labelledby", "author-contact-title");
dialog.innerHTML = `
  <form method="dialog" class="author-contact-heading">
    <span>SINCLAIR QL COMMUNITY</span>
    <button type="submit" autofocus>Close</button>
  </form>
  <h2 id="author-contact-title">Contact the author</h2>
  <p>This project grew out of admiration for the Sinclair QL and the community that keeps its history alive. In preparing it, every effort has been made to meet the applicable legal and ethical requirements, respecting the rights, licences and work of the authors and organisations involved.</p>
  <p>If any person or company considers that an included component or item of content infringes their rights, or would prefer an element they created or own not to be part of the emulator, please contact me, identifying the element and the reason for the request. Each case will be considered carefully, respectfully and in good faith; following that consideration, the elements concerned will be removed from the project.</p>
  <div class="author-contact-address">
    <strong>Luís Simões da Cunha</strong>
    <span class="author-contact-email">luis.luiscunha[at]gmail.com</span>
    <small>To write, replace <code>[at]</code> with <code>@</code>.</small>
  </div>
  <p class="author-contact-thanks">Thank you for helping preserve this history with respect for those who made it possible.</p>
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
