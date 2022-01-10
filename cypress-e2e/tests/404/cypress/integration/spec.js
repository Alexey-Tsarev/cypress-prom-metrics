it('loads page', () => {
  cy.visit('/404', {failOnStatusCode: false});
  cy.contains('404 Not Found');
});
