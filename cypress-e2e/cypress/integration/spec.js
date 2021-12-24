it('loads page', () => {
  cy.visit('/')
  cy.contains('If you see this page, the nginx web server is successfully installed')
})
