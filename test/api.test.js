const chai = require("chai");
const chaiHttp = require("chai-http");
const app = require("../server");

const should = chai.should();
const expect = chai.expect;

chai.use(chaiHttp);

describe("Api Test", function () {
    it("Registry Test", async function () {
        chai.request(app)
            .post("/api/registry")
            .end((err, res) => {
                res.should.have.status(200);
                res.body.should.be.a("json");
            });
    });
});
